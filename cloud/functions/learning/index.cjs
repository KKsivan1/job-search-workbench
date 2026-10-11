const cloudbase = require('@cloudbase/node-sdk');
const { createHash, randomUUID } = require('node:crypto');
const { generateCheckedLearning } = require('./deepseek-learning');
const { ANSWER_DOCUMENTS } = require('./core');
const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const JOBS = 'hub_learning_jobs';
const WIKI = 'hub_v2_wiki_docs';
const hash = (s) => createHash('sha256').update(s).digest('hex');
const date = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
const key = (uid, collection, id) => hash(`${uid}\0${collection}\0${id}`);
const hosts = new Set(['github.com','raw.githubusercontent.com','www.anthropic.com','docs.anthropic.com','platform.claude.com','xiaolinnote.com','www.xiaolinnote.com','www.xiaohongshu.com','xiaohongshu.com']);
async function readSource(url) {
  const parsed = new URL(url);
  if (!hosts.has(parsed.hostname) || parsed.protocol !== 'https:' || parsed.port || parsed.username || parsed.password) throw new Error('云端暂不能渲染该分享页。请补充完整正文/转写稿或文字截图；小红书短链、ColorOS及抖音纯视频暂不自动转写。');
  const response = await fetch(parsed, { redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('来源页面不可读，请粘贴正文或上传文字截图');
  const reader = response.body.getReader(); const pieces = []; let size = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 1000000) throw new Error('来源过大，请分批粘贴'); pieces.push(value); } } finally { await reader.cancel(); }
  let text = Buffer.concat(pieces).toString('utf8');
  const title = text.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '';
  if (parsed.hostname.includes('xiaohongshu')) {
    const desc = text.match(/"desc"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (!desc) throw new Error('小红书公开正文不可读，请粘贴笔记正文或上传文字截图；不会用登录页生成');
    try { text = JSON.parse('"' + desc[1] + '"'); } catch { throw new Error('小红书正文解析失败，请粘贴原文'); }
  } else if (/html/i.test(response.headers.get('content-type') || '')) {
    text = text.match(/<(?:main|article)\b[^>]*>([\s\S]*?)<\/(?:main|article)>/i)?.[1] || text;
    text = text.replace(/<(script|style|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<\/(?:p|div|h[1-6]|li|section)>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'").replace(/&#(?:x([0-9a-f]+)|(\d+));/gi,(original,hex,decimal)=>{const point=parseInt(hex||decimal,hex?16:10);return point>0&&point<=0x10ffff?String.fromCodePoint(point):original;}).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/[ \t]+/g,' ').trim();
  }
  return { text, title };
}
function validate(input) {
  if (!input || input.consent !== true || typeof input.text !== 'string' || typeof input.sourceUrl !== 'string' || typeof input.title !== 'string') throw new Error('资料输入或发送授权无效');
  if (input.image) throw new Error('请先完成浏览器图片文字识别');
  if (input.text.length > 60000 || input.title.length > 120 || /[\r\n]/.test(input.title)) throw new Error('资料过长或标题格式不正确');
  if (/sk-[a-z0-9]{20,}/i.test(input.text+input.sourceUrl)) throw new Error('资料疑似包含密钥，请移除');
  if (input.sourceUrl) { const url = new URL(input.sourceUrl); if (url.protocol !== 'https:' || url.port || url.username || url.password) throw new Error('请使用不含账号密码的 HTTPS 来源'); }
  if (!input.sourceUrl && input.text.trim().length < 30) throw new Error('请输入至少30字正文或支持的链接');
  return { title: input.title.trim(), sourceUrl: input.sourceUrl, text: input.text.trim(), consent: true };
}
async function reserveQuota(uid) {
  for (let slot=0;slot<10;slot++) {
    try { await db.collection(JOBS).add({ _id: hash(`quota:${uid}:${date()}:${slot}`), kind: 'quota', ownerId: uid, createdAt: new Date().toISOString() }); return; }
    catch (e) { if (!/DUPLICATE|duplicate|already exist|已存在/i.test(String(e.code)+' '+e.message)) throw e; }
  }
  throw new Error('今日已达到10份生成限额（含失败尝试），请明天重试');
}
async function ownedJob(uid, id) {
  if (!/^[a-f0-9-]{36}$/.test(id || '')) throw new Error('无效任务编号');
  const result = await db.collection(JOBS).where({ _id: id, ownerId: uid, kind: 'draft' }).limit(1).get();
  if (!result.data?.length) throw new Error('任务不存在或无权访问');
  return result.data[0];
}
exports.main = async (event) => {
  // Public cloud rollout: reject every operation before auth, quota or provider calls.
  if (event?.op === 'status') return { ok: true, available: false, description: '在线版暂不开放大模型调用。' };
  return { ok: false, error: '在线版暂不开放大模型调用' };
};
// Kept for a future separately-authorized private rollout; not an exported handler.
async function privateLearningHandler(event, context) {
  try {
    // Only runtime context may supply identity. Never trust ownerId/uid in event.
    const uid = cloudbase.getCloudbaseContext(context).TCB_UUID;
    if (typeof uid !== 'string' || !uid) throw new Error('请先登录');
    const invited = await db.collection('hub_users').where({ uid, active: true }).limit(1).get();
    if (!invited.data?.length) throw new Error('当前账号未受邀');
    if (event.op === 'status') return { ok: true, available: Boolean(process.env.DEEPSEEK_API_KEY), description: '云端 DeepSeek 已接入，草稿仅归档到当前账号；每日最多10份。' };
    if (!process.env.DEEPSEEK_API_KEY) throw new Error('云端模型服务尚未配置');
    if (event.op === 'start') {
      const input = validate(event.input); await reserveQuota(uid);
      const id = randomUUID();
      await db.collection(JOBS).add({ _id: id, kind: 'draft', ownerId: uid, input, state: 'queued', createdAt: new Date().toISOString() });
      return { ok: true, jobId: id };
    }
    const job = await ownedJob(uid, event.jobId);
    if (event.op === 'poll') return { ok: true, state: job.state, error: job.error, result: job.result };
    if (event.op !== 'run') throw new Error('不支持的操作');
    const claimed = await db.collection(JOBS).where({ _id: job._id, ownerId: uid, state: 'queued' }).update({ state: 'running', startedAt: new Date().toISOString() });
    if (claimed.updated !== 1) return { ok: true, state: job.state };
    try {
      const extracted = job.input.text ? { text: job.input.text, title: job.input.text.split(/\r?\n/)[0].replace(/^#+\s*/, '').slice(0,55) } : await readSource(job.input.sourceUrl);
      const text = extracted.text;
      if (text.length < 30 || text.length > 60000 || /sk-[a-z0-9]{20,}/i.test(text)) throw new Error('未取得足够有效正文，或正文过长/含密钥，请补充资料');
      const title = (job.input.title || extracted.title || '学习资料').replace(/[\r\n]/g,' ').slice(0,120);
      const sourceHash = hash(text);
      const duplicate = await db.collection(WIKI).where({ ownerId: uid, _openid: uid, sourceHash }).limit(1).get();
      if (duplicate.data?.length) { const row = duplicate.data[0]; const result = { title: row.title || title, id: row.hubId, markdown: row.learningMarkdown || '', source: job._id }; await db.collection(JOBS).doc(job._id).update({ state: 'done', result }); return { ok: true, state: 'done' }; }
      const available = await db.collection(WIKI).where({ ownerId: uid, _openid: uid }).limit(1000).get();
      const ids = new Set(available.data.map((row) => row.hubId));
      const related = ANSWER_DOCUMENTS.filter((d) => (d.category.startsWith('AI') || d.category.includes('产品')) && ids.has(d.id)).map((d) => ({ target: d.id.replace(/\.md$/,''), description: d.description }));
      if (!related.length) throw new Error('当前账号还没有知识库基础目录，请先导入基础知识页');
      const output = await generateCheckedLearning(title, job.input.sourceUrl, text, related);
      const slug = title.replace(/[<>:"/\\|?*\[\]#^\x00-\x1f]/g,'-').replace(/[. ]+$/g,'').slice(0,80) || '学习资料';
      const id = `questions/learning/${date()}-${slug}-${job._id.slice(0,8)}.md`;
      const content = `---\ntype: question\ntitle: ${JSON.stringify(title)}\nstatus: draft\nreviewed: false\ncreated: ${date()}\ntags: [学习入库, 待核验]\nsources: [${JSON.stringify(job.input.sourceUrl || '用户粘贴资料')} ]\nsource_sha256: ${sourceHash}\n---\n\n> [!warning] 来源与事实边界\n> 自动归档草稿，未经本人核验；不代表本人经历或已确认的最佳口述稿。\n\n${output.markdown}\n`;
      await db.collection(WIKI).add({ _id: key(uid,'wiki_docs',id), hubId: id, ownerId: uid, _openid: uid, content, version: hash(content), title, sourceHash, learningMarkdown: output.markdown, updatedAt: new Date().toISOString() });
      const result = { title, id, markdown: output.markdown, source: job._id, quality: output.quality };
      await db.collection(JOBS).doc(job._id).update({ state: 'done', result, text, sourceHash, evidenceQuotes: output.quotes, completedAt: new Date().toISOString() });
      return { ok: true, state: 'done' };
    } catch (e) { const error = String(e.message || '生成失败').replace(/sk-[a-z0-9]{20,}/gi,'[redacted]').slice(0,500); await db.collection(JOBS).doc(job._id).update({ state: 'failed', error }); return { ok: false, error }; }
  } catch (e) { return { ok: false, error: String(e.message || '服务暂不可用').replace(/sk-[a-z0-9]{20,}/gi,'[redacted]').slice(0,500) }; }
};
void privateLearningHandler;
