import { useEffect, useMemo, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { SIGN_FUNCTION_URL, supabase } from "./supabase";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

const DEFAULT_FIELD = { page: 1, x: 0.62, y: 0.78, width: 0.28, height: 0.1 };
const MAX_PDF_BYTES = 15 * 1024 * 1024;

function route() {
  const match = window.location.pathname.match(/^\/sign\/([0-9a-f-]{36})$/i);
  if (match) return { name: "sign", token: match[1] };
  if (window.location.pathname === "/new") return { name: "new" };
  return { name: "home" };
}

function go(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function safeName(name) {
  return String(name || "contract.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function Shell({ children, user }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => go("/")} aria-label="TideTracts home">
          <span className="brand-mark">T</span>
          <span>TideTracts</span>
        </button>
        <div className="top-actions">
          {user && <button className="quiet" onClick={() => supabase.auth.signOut()}>Sign out</button>}
          <button className="primary small" onClick={() => go("/new")}>+ New contract</button>
        </div>
      </header>
      {children}
    </div>
  );
}

function Login({ onSignedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (authError) return setError(authError.message);
    onSignedIn?.(data.user);
  }

  return (
    <main className="center-page">
      <section className="login-card">
        <span className="eyebrow">Powered by your Wavo account</span>
        <h1>Contracts, without the paperwork swamp.</h1>
        <p>Use the same login you use for Wavo. TideTracts keeps the PDF private and only gives signers access through their signing link.</p>
        <form onSubmit={submit} className="stack">
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
          {error && <div className="error">{error}</div>}
          <button className="primary" disabled={busy}>{busy ? "Signing in…" : "Sign in with Wavo"}</button>
        </form>
      </section>
    </main>
  );
}

function Home({ user }) {
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from("tidetracts_contracts")
      .select("id,title,status,signer_name,share_token,signed_name,signed_at,created_at,completed_path")
      .order("created_at", { ascending: false })
      .then(({ data }) => { setContracts(data || []); setLoading(false); });
  }, [user]);

  async function openCompleted(contract) {
    if (!contract.completed_path) return;
    const { data } = await supabase.storage.from("tidetracts-pdfs").createSignedUrl(contract.completed_path, 600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <main className="page">
      <section className="hero-row">
        <div><span className="eyebrow">PDF e-signing</span><h1>Your contracts</h1><p>Upload it. Place the signature. Send it. Done.</p></div>
        <button className="primary hero-button" onClick={() => go("/new")}>Create contract</button>
      </section>
      {loading ? <div className="empty">Loading contracts…</div> : contracts.length === 0 ? (
        <button className="empty clickable" onClick={() => go("/new")}><strong>No contracts yet.</strong><span>Make the first one →</span></button>
      ) : (
        <div className="contract-grid">
          {contracts.map((c) => (
            <article className="contract-card" key={c.id}>
              <div className="pdf-icon">PDF</div>
              <div className="contract-copy">
                <div className="card-head"><h3>{c.title}</h3><span className={`status ${c.status}`}>{c.status}</span></div>
                <p>{c.status === "completed" ? `Signed by ${c.signed_name || c.signer_name || "signer"}` : `Waiting for ${c.signer_name || "signature"}`}</p>
                <small>{c.signed_at ? `Completed ${formatDate(c.signed_at)}` : `Created ${formatDate(c.created_at)}`}</small>
              </div>
              <div className="card-actions">
                <button className="quiet" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/sign/${c.share_token}`)}>Copy link</button>
                {c.completed_path && <button className="quiet" onClick={() => openCompleted(c)}>Open PDF</button>}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

function PdfPlacement({ file, field, onField }) {
  const canvasRef = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!file) return;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const doc = await pdfjs.getDocument({ data: bytes }).promise;
      if (cancelled) return;
      setPdf(doc);
      setPages(doc.numPages);
      setPage(Math.min(field.page || 1, doc.numPages));
    })().catch(console.error);
    return () => { cancelled = true; };
  }, [file]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!pdf || !canvasRef.current) return;
      setRendering(true);
      const p = await pdf.getPage(page);
      const base = p.getViewport({ scale: 1 });
      const targetWidth = Math.min(760, Math.max(300, window.innerWidth - 56));
      const viewport = p.getViewport({ scale: targetWidth / base.width });
      const canvas = canvasRef.current;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.aspectRatio = `${viewport.width}/${viewport.height}`;
      await p.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      if (!cancelled) setRendering(false);
    })().catch(() => setRendering(false));
    return () => { cancelled = true; };
  }, [pdf, page]);

  function place(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = field.width || DEFAULT_FIELD.width;
    const height = field.height || DEFAULT_FIELD.height;
    const x = Math.max(0, Math.min(1 - width, (e.clientX - rect.left) / rect.width - width / 2));
    const y = Math.max(0, Math.min(1 - height, (e.clientY - rect.top) / rect.height - height / 2));
    onField({ ...field, page, x, y, width, height });
  }

  return (
    <div className="placement-wrap">
      <div className="page-toolbar">
        <button className="quiet" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>←</button>
        <span>Page {page} of {pages}</span>
        <button className="quiet" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>→</button>
      </div>
      <div className={`pdf-placement ${rendering ? "rendering" : ""}`} onClick={place}>
        <canvas ref={canvasRef} />
        {field.page === page && <div className="signature-field" style={{ left: `${field.x * 100}%`, top: `${field.y * 100}%`, width: `${field.width * 100}%`, height: `${field.height * 100}%` }}>Signature</div>}
      </div>
      <p className="placement-help">Click anywhere on the page to move the signature box.</p>
    </div>
  );
}

function NewContract({ user }) {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const wavoKind = params.get("wavo_kind");
  const wavoId = params.get("wavo_id");
  const wavoName = params.get("wavo_name");
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [signerName, setSignerName] = useState(wavoName || "");
  const [field, setField] = useState(DEFAULT_FIELD);
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shared, setShared] = useState(false);

  function choose(e) {
    const next = e.target.files?.[0];
    if (!next) return;
    if (next.type !== "application/pdf" && !next.name.toLowerCase().endsWith(".pdf")) return setError("TideTracts only accepts PDFs.");
    if (next.size > MAX_PDF_BYTES) return setError("That PDF is over 15 MB.");
    setError("");
    setFile(next);
    if (!title) setTitle(next.name.replace(/\.pdf$/i, ""));
  }

  async function createContract() {
    if (!user || !file || !title.trim()) return;
    setBusy(true);
    setError("");
    const contractId = crypto.randomUUID();
    const path = `${user.id}/${contractId}/${safeName(file.name)}`;
    try {
      const { error: uploadError } = await supabase.storage.from("tidetracts-pdfs").upload(path, file, { contentType: "application/pdf", upsert: false });
      if (uploadError) throw uploadError;
      const { data, error: insertError } = await supabase.from("tidetracts_contracts").insert({
        id: contractId,
        owner_id: user.id,
        title: title.trim(),
        original_path: path,
        signer_name: signerName.trim() || null,
        signature_field: field,
        status: "sent",
      }).select("id,title,share_token,status").single();
      if (insertError) {
        await supabase.storage.from("tidetracts-pdfs").remove([path]);
        throw insertError;
      }
      setCreated(data);
    } catch (err) {
      setError(err?.message || "Couldn't create the contract.");
    } finally {
      setBusy(false);
    }
  }

  async function shareToWavo() {
    if (!created || !wavoKind || !wavoId) return;
    setBusy(true);
    setError("");
    const signUrl = `${window.location.origin}/sign/${created.share_token}`;
    const payload = JSON.stringify({ v: 1, title: created.title, url: signUrl, token: created.share_token, status: "sent" });
    try {
      if (wavoKind === "dm") {
        const chatId = [user.id, wavoId].sort().join("_");
        const { error: msgError } = await supabase.from("messages").insert({ chat_id: chatId, sender_id: user.id, receiver_id: wavoId, content: payload, type: "contract", is_read: false });
        if (msgError) throw msgError;
      } else if (wavoKind === "space") {
        const { error: msgError } = await supabase.from("group_messages").insert({ group_id: wavoId, user_id: user.id, sender_id: user.id, content: payload, type: "contract" });
        if (msgError) throw msgError;
      }
      setShared(true);
    } catch (err) {
      setError(err?.message || "Couldn't send this contract to Wavo.");
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    const signUrl = `${window.location.origin}/sign/${created.share_token}`;
    return (
      <main className="center-page">
        <section className="done-card">
          <div className="done-check">✓</div>
          <span className="eyebrow">Ready to sign</span>
          <h1>{created.title}</h1>
          <p>The PDF is private. Anyone with this signing link can review and sign this contract.</p>
          <div className="share-link"><input readOnly value={signUrl} /><button className="quiet" onClick={() => navigator.clipboard.writeText(signUrl)}>Copy</button></div>
          {wavoKind && wavoId && <button className="wavo-button" disabled={busy || shared} onClick={shareToWavo}>{shared ? `Sent to ${wavoName || "Wavo"} ✓` : `Send to ${wavoName ? `@${wavoName}` : "Wavo"}`}</button>}
          <button className="primary" onClick={() => go("/")}>Back to contracts</button>
          {error && <div className="error">{error}</div>}
        </section>
      </main>
    );
  }

  return (
    <main className="page narrow">
      <div className="new-head"><button className="back" onClick={() => go("/")}>←</button><div><span className="eyebrow">New contract</span><h1>Set up the PDF</h1></div></div>
      {!file ? (
        <label className="dropzone">
          <input type="file" accept="application/pdf,.pdf" onChange={choose} />
          <span className="upload-mark">↑</span>
          <strong>Choose a PDF</strong>
          <span>Up to 15 MB</span>
        </label>
      ) : (
        <div className="new-layout">
          <section className="setup-card stack">
            <label>Contract name<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} /></label>
            <label>Who is signing?<input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Name (optional)" maxLength={120} /></label>
            <div className="selected-file"><span>PDF</span><div><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(1)} MB</small></div><button className="quiet" onClick={() => setFile(null)}>Change</button></div>
            <button className="primary" onClick={createContract} disabled={busy || !title.trim()}>{busy ? "Creating…" : "Create signing link"}</button>
            {wavoKind && <small className="wavo-hint">After creating, you can send it straight back to {wavoName ? `@${wavoName}` : "this Wavo chat"}.</small>}
            {error && <div className="error">{error}</div>}
          </section>
          <section className="preview-card"><div className="preview-title"><strong>Place signature</strong><span>Click the PDF</span></div><PdfPlacement file={file} field={field} onField={setField} /></section>
        </div>
      )}
      {error && !file && <div className="error standalone">{error}</div>}
    </main>
  );
}

function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.max(1, window.devicePixelRatio || 1);
      const old = canvas.toDataURL();
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      const ctx = canvas.getContext("2d");
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#10213a";
      if (old && old !== "data:,") {
        const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height); img.src = old;
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  function point(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function down(e) {
    drawing.current = true;
    const p = point(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
    canvasRef.current.setPointerCapture?.(e.pointerId);
  }
  function move(e) {
    if (!drawing.current) return;
    const p = point(e); const ctx = canvasRef.current.getContext("2d"); ctx.lineTo(p.x, p.y); ctx.stroke();
  }
  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current.toDataURL("image/png"));
  }
  function clear() {
    const canvas = canvasRef.current; const rect = canvas.getBoundingClientRect(); const ctx = canvas.getContext("2d"); ctx.clearRect(0, 0, rect.width, rect.height); onChange("");
  }

  return <div className="signature-pad"><canvas ref={canvasRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} /><button type="button" className="clear-sign" onClick={clear}>Clear</button><span>Sign here</span></div>;
}

function SignContract({ token }) {
  const [contract, setContract] = useState(null);
  const [signature, setSignature] = useState("");
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => {
    fetch(`${SIGN_FUNCTION_URL}?token=${encodeURIComponent(token)}`)
      .then(async (r) => { const body = await r.json(); if (!r.ok) throw new Error(body.error || "Couldn't open contract"); return body; })
      .then((body) => { setContract(body.contract); setName(body.contract.signerName || ""); if (body.contract.status === "completed") setDone({ pdfUrl: body.contract.pdfUrl, signedAt: body.contract.signedAt }); })
      .catch((err) => setError(err.message));
  }, [token]);

  async function sign() {
    if (!signature || !name.trim() || !agree) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(SIGN_FUNCTION_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, signatureData: signature, signedName: name.trim() }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Couldn't sign contract");
      setDone(body);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  if (error && !contract) return <main className="center-page"><section className="done-card"><div className="done-check bad">!</div><h1>Signing link unavailable</h1><p>{error}</p></section></main>;
  if (!contract) return <main className="center-page"><div className="empty">Opening secure PDF…</div></main>;
  if (done) return <main className="center-page"><section className="done-card"><div className="done-check">✓</div><span className="eyebrow">Signed</span><h1>{contract.title}</h1><p>This contract is complete{done.signedAt ? ` as of ${formatDate(done.signedAt)}` : ""}.</p>{done.pdfUrl && <a className="primary link-button" href={done.pdfUrl} target="_blank" rel="noreferrer">Open completed PDF</a>}</section></main>;

  return (
    <main className="sign-page">
      <header className="sign-head"><div className="brand"><span className="brand-mark">T</span><span>TideTracts</span></div><span className="secure-pill">Private signing link</span></header>
      <section className="sign-document"><div className="doc-head"><div><span className="eyebrow">Review document</span><h1>{contract.title}</h1></div><span className="status sent">needs signature</span></div><iframe title={contract.title} src={contract.pdfUrl} /></section>
      <aside className="sign-panel">
        <span className="eyebrow">Your signature</span><h2>Ready when you are.</h2><p>Read the PDF first, then sign below.</p>
        <label>Full name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={120} /></label>
        <SignaturePad onChange={setSignature} />
        <label className="agree"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /><span>I agree to sign this document electronically.</span></label>
        {error && <div className="error">{error}</div>}
        <button className="primary" onClick={sign} disabled={busy || !signature || !name.trim() || !agree}>{busy ? "Finishing…" : "Sign & finish"}</button>
        <small className="fine-print">TideTracts records the signing time and creates a completed PDF. Some document types may have additional legal requirements.</small>
      </aside>
    </main>
  );
}

export default function App() {
  const [current, setCurrent] = useState(route());
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    const pop = () => setCurrent(route());
    window.addEventListener("popstate", pop);
    supabase.auth.getUser().then(({ data }) => setUser(data.user || null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    return () => { window.removeEventListener("popstate", pop); data.subscription.unsubscribe(); };
  }, []);

  if (current.name === "sign") return <SignContract token={current.token} />;
  if (user === undefined) return <main className="center-page"><div className="empty">Loading TideTracts…</div></main>;
  if (!user) return <Login onSignedIn={setUser} />;
  return <Shell user={user}>{current.name === "new" ? <NewContract user={user} /> : <Home user={user} />}</Shell>;
}
