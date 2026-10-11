const cloudbase = require('@cloudbase/node-sdk');
const { createHash } = require('node:crypto');
const { TIMELINE_ID, MAPPING_ID } = require('./core');
const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const physicalId = (uid, id) => createHash('sha256').update(`${uid}\0wiki_docs\0${id}`).digest('hex');
const templates = [
  ['questions/自我介绍模板.md', '# 自我介绍模板\n\n## 30 秒自我介绍\n填写身份、求职方向和一项真实经历。\n\n## 项目表达\n背景 → 目标 → 自己的行动 → 已核验结果 → 反思。\n'],
  ['questions/项目经历模板.md', '# 项目经历模板\n\n## 项目背景\n说明业务问题和目标。\n\n## 我的贡献\n仅填写自己的真实贡献。\n\n## 结果与反思\n写清指标口径、已验证结果和下一步。\n'],
  ['questions/面试准备清单.md', '# 面试准备清单\n\n## 面试前\n核对 JD、准备代表项目、复习关键知识、检查设备。\n\n## 面试后\n补全问题和原回答，明确下一步。\n'],
  [TIMELINE_ID, '# 面试时间线\n\n| 编号 | 日期 | 公司 | 岗位 | 轮次 | 置信度 | 备注 | 复盘 |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n'],
  [MAPPING_ID, '# 面试问答映射表\n\n## 真实面试\n'],
];
exports.main = async (event, context) => {
  try {
    const uid = cloudbase.getCloudbaseContext(context).TCB_UUID;
    if (typeof uid !== 'string' || !uid) return { ok: false, error: '请先完成邮箱验证并登录' };
    if (event?.op !== 'enroll') return { ok: false, error: '不支持的操作' };
    const members = db.collection('hub_users');
    const existing = await members.where({ uid }).limit(1).get();
    if (existing.data?.length) {
      if (existing.data[0].active !== true) return { ok: false, error: '账号已停用，请联系管理员' };
      return { ok: true };
    }
    // Server-owned membership: callers cannot choose uid, role or model access.
    // Populate generic documents BEFORE granting access; never copy another account.
    for (const [id, content] of templates) {
      const key = physicalId(uid, id);
      const docs = db.collection('hub_v2_wiki_docs');
      const exists = await docs.where({ _id: key, ownerId: uid, _openid: uid }).limit(1).get();
      if (exists.data?.length) continue;
      try { await docs.add({ _id: key, hubId: id, ownerId: uid, _openid: uid, content, version: createHash('sha256').update(content).digest('hex'), updatedAt: new Date().toISOString() }); }
      catch (error) { if (!/DUPLICATE|duplicate|already exist|已存在/i.test(String(error.code)+' '+error.message)) throw error; }
    }
    try { await members.add({ _id: uid, uid, active: true, aiAccess: false, role: 'member', source: 'self-registration', createdAt: new Date().toISOString() }); }
    catch (error) {
      if (!/DUPLICATE|duplicate|already exist|已存在/i.test(String(error.code)+' '+error.message)) throw error;
      const row = await members.where({ uid, active: true }).limit(1).get();
      if (!row.data?.length) return { ok: false, error: '账号不可用，请联系管理员' };
    }
    return { ok: true };
  } catch { return { ok: false, error: '个人空间初始化失败，请稍后重试或联系管理员' }; }
};
