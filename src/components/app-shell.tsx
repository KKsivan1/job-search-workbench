"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUpRight, BookOpenText, BriefcaseBusiness, ChartNoAxesCombined, Compass, Layers3, LogOut, Sparkles } from "lucide-react";
import { api, isCloud } from "@/lib/data-provider";
import { NavigationHint } from "./navigation-hint";

const links = [
  { href: "/", label: "总览", icon: Compass },
  { href: "/answers", label: "回答库", icon: BookOpenText },
  { href: "/interviews", label: "真实面试", icon: Layers3 },
  { href: "/applications", label: "投递看板", icon: BriefcaseBusiness },
  { href: "/practice", label: "复练中心", icon: ChartNoAxesCombined },
  { href: "/learn", label: "学习入库", icon: Sparkles },
];

type Gate = "checking" | "ok" | "rejected";

function ShellFrame({ children, modeBadge, sidebarBottom, onSignOut }: { children: React.ReactNode; modeBadge: React.ReactNode; sidebarBottom: React.ReactNode; onSignOut?: () => void }) {
  return <div className="app-shell">
    <aside className="sidebar">
      <Link className="brand" href="/"><span className="brand-mark"><Sparkles size={23} strokeWidth={1.7} /></span><span><strong>求职工作台</strong><small>PERSONAL WORKSPACE</small></span></Link>
      <div className="sidebar-label">WORKSPACE</div>
      <nav className="main-nav">{links.filter((link) => !isCloud || !["/practice", "/learn"].includes(link.href)).map(({ href, label, icon: Icon }) => <Link key={href} href={href}><Icon size={18} strokeWidth={1.8} /><span>{label}<NavigationHint /></span><ArrowUpRight size={14} className="nav-arrow" /></Link>)}</nav>
      <div className="sidebar-bottom">
        {sidebarBottom}
        {onSignOut && <button type="button" className="signout-button" onClick={onSignOut}><LogOut size={14} />退出登录</button>}
      </div>
    </aside>
    <div className="main-area"><header className="topbar"><span>求职管理 · 个人空间</span><span className="topbar-right">{modeBadge}</span></header><main>{children}</main></div>
  </div>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname.replace(process.env.NEXT_PUBLIC_BASE_PATH || "", "").replace(/\/$/, "") === "/login";
  const [gate, setGate] = useState<Gate>(isCloud && !isLogin ? "checking" : "ok");
  const [username, setUsername] = useState("");

  useEffect(() => {
    if (!isCloud || isLogin || !api.auth) return;
    let alive = true;
    (async () => {
      const auth = api.auth!;
      const session = await auth.getSession();
      if (!session) { router.replace("/login"); return; }
      await auth.openWorkspace();
      const invited = await auth.isInvited();
      if (!alive) return;
      if (!invited) { setGate("rejected"); return; }
      setUsername(session.username);
      setGate("ok");
    })().catch(() => { if (alive) router.replace("/login"); });
    return () => { alive = false; };
  }, [isLogin, router]);

  if (!isCloud) {
    return <ShellFrame
      modeBadge={<><span className="local-dot" /> LOCAL MODE</>}
      sidebarBottom={<><div className="local-dot" />本地私人工作台<div className="sidebar-footnote">内容同步自 Obsidian Wiki<br />投递数据仅保存在这台电脑</div></>}
    >{children}</ShellFrame>;
  }

  if (!isLogin && gate === "checking") {
    return <ShellFrame modeBadge={<><span className="local-dot" /> CLOUD MODE</>} sidebarBottom={null}>
      <div className="page-wrap"><div className="empty-inline">正在验证登录状态…</div></div>
    </ShellFrame>;
  }

  if (gate === "rejected") {
    return <ShellFrame
      modeBadge={<><span className="local-dot" /> CLOUD MODE</>}
      sidebarBottom={null}
      onSignOut={async () => { await api.auth?.signOut(); router.replace("/login"); }}
    >
      <div className="page-wrap"><div className="empty-state">
        <h2>该账号暂不可用</h2>
        <p>个人空间未启用或账号已停用，请联系管理员。不会开放其他账号的数据。</p>
        <button className="text-button" onClick={async () => { await api.auth?.signOut(); router.replace("/login"); }}>退出并返回登录</button>
      </div></div>
    </ShellFrame>;
  }

  return <ShellFrame
    modeBadge={<><span className="local-dot" /> CLOUD MODE</>}
    sidebarBottom={<><div className="local-dot" />云端工作台 · {username || "已登录"}<div className="sidebar-footnote">注册后自动开通个人空间<br />AI 模块暂不开放</div></>}
    onSignOut={async () => { await api.auth?.signOut(); router.replace("/login"); }}
  >{["/practice", "/learn"].includes(pathname.replace(process.env.NEXT_PUBLIC_BASE_PATH || "", "").replace(/\/$/, "")) ? <div className="page-wrap"><div className="empty-state"><h2>此模块暂未开放</h2><p>在线版暂不提供复练中心、学习入库和大模型调用。投递、日历、面试记录和回答库仍可使用。</p><Link className="text-button" href="/">返回工作台</Link></div></div> : children}</ShellFrame>;
}
