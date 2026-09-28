import React, { lazy, Suspense, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Mail, ShieldCheck, Lock, Eye, EyeOff } from "@/lib/icons";
import { BRAND } from "@/lib/brand";
import { SITE_URL } from "@/lib/site";
import { Button, Panel, Field, Eyebrow, Chip, SectionHeading, inputClass } from "@/components/kit";
import { configured, db, requireAdmin, setupError } from "./client";
const Dashboard = lazy(() => import("./workspace").then((m) => ({ default: m.Dashboard })));
import { useToast } from "@/lib/toast-context";
import { errorMessage as message } from "./feedback";
export function App() {
  const { toast } = useToast();
  const [identity, setIdentity] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => {
    let active = true;
    let generation = 0;
    async function verify() {
      const current = ++generation;
      try {
        const user = await requireAdmin();
        if (active && current === generation) setIdentity(user.email || user.id);
      } catch {
        if (active && current === generation) setIdentity(null);
      } finally {
        if (active && current === generation) setChecking(false);
      }
    }
    void verify();
    const sub = db?.auth.onAuthStateChange(() => {
      setTimeout(() => {
        if (active) void verify();
      }, 0);
    });
    const interval = setInterval(() => void verify(), 60000);
    const focus = () => void verify();
    window.addEventListener("focus", focus);
    return () => {
      active = false;
      sub?.data.subscription.unsubscribe();
      clearInterval(interval);
      window.removeEventListener("focus", focus);
    };
  }, []);
  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      if (!db) throw new Error("Supabase configuration is missing.");
      const result = await db.auth.signInWithPassword({
        email: String(data.get("email")),
        password: String(data.get("password")),
      });
      if (result.error) throw result.error;
      const user = await requireAdmin();
      setIdentity(user.email || user.id);
      toast({
        title: "Signed in",
        description: "Your admin workspace is ready.",
      });
    } catch (e) {
      setError(message(e));
      toast({
        title: "Could not sign in",
        description: message(e),
        tone: "error",
      });
      await db?.auth.signOut({ scope: "local" });
    } finally {
      setBusy(false);
    }
  }
  if (checking)
    return (
      <main className="login">
        <p role="status">Checking access…</p>
      </main>
    );
  if (!identity)
    return (
      <main className="login">
        <Panel className="login-shell">
          <div className="login-form-side">
            <a className="login-back" href={SITE_URL}>
              <ArrowLeft className="size-4" /> Back to the studio
            </a>
            <div className="login-form-content">
              <a href={SITE_URL} className="login-brand" aria-label={BRAND.name}>
                <span className="login-brand-mark">
                  <img src="/favicon.ico" alt="" width="32" height="32" />
                </span>
                <span>
                  {BRAND.nameLead}
                  <span className="login-brand-tail">{BRAND.nameTail}</span>
                </span>
              </a>
              <div className="login-heading">
                <h1>
                  Welcome back<span>.</span>
                </h1>
                <p>Your studio. Everything in one place.</p>
              </div>
              <form onSubmit={login} aria-busy={busy}>
                {!configured && <p role="alert">{setupError}</p>}
                <Field label="Email address">
                  <span className="login-input-wrap">
                    <Mail className="size-4" aria-hidden="true" />
                    <input
                      className={inputClass}
                      name="email"
                      type="email"
                      autoComplete="username"
                      placeholder="you@zcraftstudios.com"
                      disabled={busy}
                      required
                    />
                  </span>
                </Field>
                <Field label="Password">
                  <span className="login-input-wrap">
                    <Lock className="size-4" aria-hidden="true" />
                    <input
                      className={inputClass}
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      disabled={busy}
                      required
                    />
                  </span>
                </Field>
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}{" "}
                  {showPassword ? "Hide password" : "Show password"}
                </button>
                {error && <p role="alert">{error}</p>}
                <Button className="login-submit" disabled={busy || !configured}>
                  {busy ? "Signing in…" : "Enter workspace"}
                  <ArrowRight className="size-4" />
                </Button>
              </form>
              <p className="login-access-note">
                <ShieldCheck className="size-4" /> Authorized studio administrators only
              </p>
            </div>
            <p className="login-copyright">
              ZCraft Studios <span>•</span> Built for what you build.
            </p>
          </div>
          <section className="login-visual" aria-label="Studio workspace">
            <div className="login-visual-top">
              <Chip tone="mint">STUDIO CONTROL</Chip>
              <span className="login-private">
                <span /> Private workspace
              </span>
            </div>
            <img
              className="login-art"
              src="/images/studio-access.webp"
              alt="A studio dashboard with Minecraft resource blocks and a secure access shield"
              width="1024"
              height="1024"
              fetchPriority="high"
            />
            <div className="login-visual-copy">
              <Eyebrow tone="cyan">Create. Manage. Ship.</Eyebrow>
              <h2>
                Behind every great server,
                <br />a well-run studio.
              </h2>
              <p>
                Products, content, and customer requests.
                <br />
                One home for everything you make.
              </p>
            </div>
            <div className="login-tags">
              <span>Plugins & configs</span>
              <span>Content & releases</span>
              <span>Customer care</span>
            </div>
          </section>
        </Panel>
      </main>
    );
  return (
    <Suspense
      fallback={
        <main className="login">
          <p role="status">Opening your workspace…</p>
        </main>
      }
    >
      <Dashboard
        identity={identity}
        logout={async () => {
          const result = await db!.auth.signOut();
          setIdentity(null);
          if (result.error) setError(result.error.message);
        }}
      />
    </Suspense>
  );
}
