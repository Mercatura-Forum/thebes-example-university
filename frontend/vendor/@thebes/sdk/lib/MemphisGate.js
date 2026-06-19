import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * MemphisGate — open-demo wrapper with Memphis passkey sign-in on demand.
 *
 * This is a public demo: anyone can roam the catalog, browse courses, and view
 * the registrar without signing in. Memphis passkey sign-in is offered in the
 * header (SignOutChip) and prompted only when a visitor wants a persistent
 * identity. Sign-in attaches a human display name; the on-chain caller is the
 * boundary's persisted browser key either way, so reads and writes work for
 * guests too. Same API as every other Thebes example (wrap routes in
 * <MemphisGate>, read the session via useAuth(), sign in / out via
 * SignOutChip); only the Quad styling is specific to this app.
 */
import { createContext, useContext, useState } from 'react';
import { useMemphis } from './useMemphis.js';
const AuthCtx = createContext(null);
/** The Memphis session (signed in or guest). Throws if used outside the gate. */
export function useAuth() {
    const v = useContext(AuthCtx);
    if (!v)
        throw new Error('useAuth must be used inside <MemphisGate>');
    return v;
}
/** Open demo: always render the app. Sign-in is on demand via SignOutChip. */
export function MemphisGate({ children }) {
    const auth = useMemphis();
    return _jsx(AuthCtx.Provider, { value: auth, children: children });
}
/**
 * Header auth control. Guests see a "Sign in" affordance that expands into a
 * name + passkey prompt; signed-in visitors see their name and a sign-out link.
 * Styled with Quad's --color-accent token so it reads native.
 */
export function SignOutChip({ className = '' }) {
    const auth = useAuth();
    const [name, setName] = useState('');
    const [open, setOpen] = useState(false);
    if (auth.signedIn)
        return (_jsxs("span", { className: `inline-flex items-center gap-2 text-xs ${className}`, children: [_jsxs("span", { className: "text-ink-soft", children: ["Signed in as ", _jsx("b", { className: "text-ink", children: auth.displayName })] }), _jsx("button", { className: "rounded-md px-2 py-1 font-medium opacity-80 hover:opacity-100", style: { color: 'var(--color-accent)' }, onClick: auth.signOut, children: "Sign out" })] }));
    // Memphis handles look like  <stem>.thebes  — we append ".thebes" so a visitor
    // only types the stem (3–32 chars, a–z 0–9 -). No bare fallback: an invalid
    // stem keeps the button disabled instead of failing with a cryptic error.
    const stem = name.trim().toLowerCase().replace(/\.thebes$/, '');
    const stemOk = stem.length >= 3 && stem.length <= 32 && /^[a-z0-9-]+$/.test(stem) && !stem.startsWith('-') && !stem.endsWith('-');
    const handle = `${stem}.thebes`;
    const submit = () => { if (stemOk && !auth.busy)
        auth.signIn(handle).catch(() => { }); };
    if (!open)
        return (_jsx("button", { className: `rounded-lg px-3 py-1.5 text-sm font-semibold transition hover:brightness-110 ${className}`, style: { color: 'var(--color-accent)' }, onClick: () => setOpen(true), children: "Sign in" }));
    return (_jsxs("span", { className: `inline-flex flex-col items-stretch gap-1 ${className}`, children: [_jsxs("span", { className: "inline-flex items-center gap-2", children: [_jsx("input", { className: "rounded-lg border border-black/10 bg-black/[0.03] px-2.5 py-1.5 text-sm outline-none focus:border-black/30", placeholder: "yourname", value: name, autoFocus: true, "aria-label": "Thebes handle", onChange: (e) => setName(e.target.value), onKeyDown: (e) => e.key === 'Enter' && submit() }), _jsx("button", { className: "rounded-lg px-3 py-1.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50", style: { background: 'var(--color-accent)' }, onClick: submit, disabled: auth.busy || !stemOk, children: auth.busy ? 'Signing in…' : 'Sign in with passkey' })] }), _jsxs("span", { style: { fontSize: '11px', opacity: 0.7 }, children: [stem ? _jsxs(_Fragment, { children: ["\u2192 becomes ", _jsx("b", { children: handle })] }) : 'pick a handle — we add .thebes', " \u00B7 3\u201332 \u00B7 a\u2013z 0\u20139 -"] }), auth.error && _jsx("span", { className: "text-xs text-red-700", children: auth.error })] }));
}
