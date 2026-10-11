"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, Sparkles } from "lucide-react";
import { api, isCloud } from "@/lib/data-provider";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register" | "verify">("login");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [verifier, setVerifier] = useState<{ verify: (code: string) => Promise<void> } | null>(null);
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(() => (isCloud && api.auth ? "正在检查登录状态…" : ""));

  useEffect(() => {
    if (!isCloud) { router.replace("/"); return; }
    if (!api.auth) return;
    let alive = true;
    (async () => {
      const session = await api.auth!.getSession();
      if (!alive) return;
      if (!session) { setNotice(""); return; }
      await api.auth!.openWorkspace();
      const invited = await api.auth!.isInvited();
      if (!alive) return;
      if (invited) router.replace("/");
      else { setNotice(""); await api.auth!.signOut(); }
    })().catch(() => { if (alive) setNotice(""); });
    return () => { alive = false; };
  }, [router]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!api.auth) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "register") {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username.trim())) throw new Error("请输入有效邮箱");
        if (password.length < 8 || password.length > 32 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new Error("密码须为8—32位，并包含字母与数字");
        if (password !== confirmPassword) throw new Error("两次输入的密码不一致");
        setVerifier(await api.auth.beginRegistration(username.trim(), password));
        setMode("verify");
        setSuccess("验证码已发送，请查看邮箱，输入验证码后创建个人工作台。");
        return;
      }
      if (mode === "verify") {
        if (!verifier || !code.trim()) throw new Error("请输入邮件验证码，或重新发起注册");
        await verifier.verify(code.trim());
      } else await api.auth.signIn(username.trim(), password);
      await api.auth.openWorkspace();
      const invited = await api.auth.isInvited();
      if (!invited) {
        await api.auth.signOut();
        setError("个人空间尚未就绪，请重新登录或联系管理员。");
        return;
      }
      router.replace("/");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "登录失败，请检查账号和密码");
    } finally {
      setBusy(false);
    }
  }

  return <div className="login-page">
    <div className="login-card">
      <div className="login-brand"><span className="brand-mark"><Sparkles size={26} strokeWidth={1.7} /></span><div><strong>求职工作台</strong><small>注册即拥有个人空间 · 数据按账号隔离</small></div></div>
      {notice ? <p className="muted small">{notice}</p> : <form onSubmit={submit}>
        {mode !== "verify" ? <>
          <label>{mode === "register" ? "邮箱" : "用户名或邮箱"}<input type={mode === "register" ? "email" : "text"} value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoFocus required disabled={busy} /></label>
          <label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} required disabled={busy} /></label>
          {mode === "register" && <><p className="muted small">8—32位，包含字母与数字；请勿使用其他网站的密码。</p><label>确认密码<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required disabled={busy} /></label></>}
        </> : <label>邮箱验证码<input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" autoFocus required disabled={busy} /><small className="muted">发送至 {username}，请同时检查垃圾邮件。</small></label>}
        {success && <p className="muted small" role="status">{success}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button wide" type="submit" disabled={busy}><LogIn size={16} />{busy ? "处理中…" : mode === "register" ? "发送验证码" : mode === "verify" ? "验证并创建工作台" : "登录工作台"}</button>
        <button className="text-button wide" type="button" disabled={busy} onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setSuccess(""); setVerifier(null); setCode(""); setPassword(""); setConfirmPassword(""); }}>{mode === "login" ? "没有账号？注册个人工作台" : "已有账号？返回登录"}</button>
        <p className="login-footnote">注册后从空白记录与通用模板开始，不会看到他人资料。在线版暂不开放复练中心、学习入库和大模型调用。</p>
      </form>}
    </div>
  </div>;
}
