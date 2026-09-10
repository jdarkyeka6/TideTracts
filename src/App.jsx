import { useEffect, useMemo, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { SIGN_FUNCTION_URL, signInWithWavo, supabase } from "./supabase";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

const DEFAULT_FIELD = { page: 1, x: 0.62, y: 0.78, width: 0.28, height: 0.1 };
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_PACKET_BYTES = 50 * 1024 * 1024;
const MAX_DOCUMENTS = 10;

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
  return String(name || "document.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  return `${(bytes / 1024 / 1024).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

function Brand() {
  return (
    <button className="brand" onClick={() => go("/")} aria-label="TideTracts home">
      <span className="brand-mark">T</span>
      <span>TideTracts</span>
    </button>
  );
}

function Shell({ children, user }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand />
        <div className="top-actions">
          {user && <button className="quiet" onClick={() => supabase.auth.signOut()}>Sign out</button>}
          <button className="primary small" onClick={() => go("/new")}>+ New packet</button>
        </div>
      </header>
      {children}
    </div>
  );
}

function Login({ onSignedIn }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { data, error: authError } = await signInWithWavo(username, password);
    setBusy(false);
    if (authError) return setError(authError.message);
    onSignedIn?.(data.user);
  }

  return (
    <main className="center-page login-page">
      <section className="login-card">
        <div className="login-brand"><span className="brand-mark">T</span><strong>TideTracts</strong></div>
        <span className="eyebrow">Powered by your Wavo account</span>
        <h1>Send PDFs.<br />Get them signed.</h1>
        <p>Create one clean packet with everything the other person needs to read and sign.</p>
        <form onSubmit={submit} className="stack" noValidate>
          <label>Username<input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="Username" required /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Password" required /></label>
          {error && <div className="error">{error}</div>}
          <button className="primary login-button" disabled={busy || !username.trim() || !password}>{busy ? "Signing in..." : "Sign in with Wavo"}</button>
        </form>
      </section>
    </main>
  );
}

function packetCounts(contract) {
  const docs = contract.tidetracts_documents || [];
  return {
    docs,
    count: docs.length || 1,
    required: docs.filter((d) => d.requires_signature).length || (docs.length ? 0 : 1),
  };
}

function Home({ user }) {
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    supabase.from("tidetracts_contracts")
      .select("id,title,status,signer_name,share_token,signed_name,signed_at,created_at,tidetracts_documents(id,file_name,requires_signature,completed_path,original_path,position)")
      .order("created_at", { ascending: false })
      .then(({ data, error: queryError }) => {
        if (queryError) setError(queryError.message);
        setContracts((data || []).map((c) => ({
          ...c,
          tidetracts_documents: [...(c.tidetracts_documents || [])].sort((a, b) => a.position - b.position),
        })));
        setLoading(false);
      });
  }, [user]);

  async function openDocument(document) {
    const path = document.completed_path || document.original_path;
    if (!path) return;
    const { data, error: signError } = await supabase.storage.from("tidetracts-pdfs").createSignedUrl(path, 600);
    if (signError) return setError(signError.message);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <main className="page dashboard-page">
      <section className="hero-row">
        <div>
          <span className="eyebrow">PDF packets and e-signing</span>
          <h1>Your TideTracts</h1>
          <p>Keep the paperwork together. Make only the documents that need a signature require one.</p>
        </div>
        <button className="primary hero-button" onClick={() => go("/new")}>Create packet</button>
      </section>

      {error && <div className="error page-error">{error}</div>}
      {loading ? <div className="empty">Loading your packets...</div> : contracts.length === 0 ? (
        <button className="empty clickable" onClick={() => go("/new")}>
          <span className="empty-icon">＋</span>
          <strong>No packets yet</strong>
          <span>Upload your first PDFs</span>
        </button>
      ) : (
        <div className="contract-grid">
          {contracts.map((c) => {
            const counts = packetCounts(c);
            return (
              <article className="contract-card" key={c.id}>
                <div className="packet-icon"><span>PDF</span><i>{counts.count}</i></div>
                <div className="contract-copy">
                  <div className="card-head"><h3>{c.title}</h3><span className={`status ${c.status}`}>{c.status}</span></div>
                  <p>{counts.count} PDF{counts.count === 1 ? "" : "s"} · {counts.required} require{counts.required === 1 ? "s" : ""} signature</p>
                  <small>{c.status === "completed" ? `${c.signed_name ? `Completed by ${c.signed_name} · ` : "Completed · "}${formatDate(c.signed_at)}` : `${c.signer_name ? `Waiting for ${c.signer_name} · ` : "Waiting for signature · "}${formatDate(c.created_at)}`}</small>
                  {counts.docs.length > 0 && (
                    <div className="document-pills">
                      {counts.docs.slice(0, 4).map((doc) => (
                        <button key={doc.id} onClick={() => openDocument(doc)} title={doc.file_name}>
                          <span>{doc.requires_signature ? "✍" : "👁"}</span>{doc.file_name}
                        </button>
                      ))}
                      {counts.docs.length > 4 && <span className="more-pill">+{counts.docs.length - 4}</span>}
                    </div>
                  )}
                </div>
                <div className="card-actions">
                  <button className="quiet" onClick={() => copyText(`${window.location.origin}/sign/${c.share_token}`)}>Copy link</button>
                </div>
              </article>
            );
          })}
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
      const targetWidth = Math.min(760, Math.max(300, window.innerWidth - 80));
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
        <button className="quiet mini" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>←</button>
        <span>Page {page} of {pages}</span>
        <button className="quiet mini" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>→</button>
      </div>
      <div className={`pdf-placement ${rendering ? "rendering" : ""}`} onClick={place}>
        <canvas ref={canvasRef} />
        <div className="signature-field" style={{ left: `${field.x * 100}%`, top: `${field.y * 100}%`, width: `${field.width * 100}%`, height: `${field.height * 100}%` }}>Signature</div>
      </div>
      <p className="placement-help">Click the PDF to move the signature box.</p>
    </div>
  );
}

function DocumentRow({ doc, selected, onSelect, onToggle, onRemove }) {
  return (
    <div className={`document-row ${selected ? "selected" : ""}`}>
      <button className="document-main" onClick={onSelect}>
        <span className="mini-pdf">PDF</span>
        <span className="document-meta"><strong>{doc.file.name}</strong><small>{formatBytes(doc.file.size)}</small></span>
      </button>
      <button className={`sign-toggle ${doc.requiresSignature ? "required" : "review"}`} onClick={onToggle} title="Toggle signing requirement">
        {doc.requiresSignature ? <><span>✍</span><span>Signature</span></> : <><span>👁</span><span>Review only</span></>}
      </button>
      <button className="remove-doc" onClick={onRemove} aria-label={`Remove ${doc.file.name}`}>×</button>
    </div>
  );
}

function NewContract({ user }) {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const wavoKind = params.get("wavo_kind");
  const wavoId = params.get("wavo_id");
  const wavoName = params.get("wavo_name");
  const fileInput = useRef(null);
  const [documents, setDocuments] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [title, setTitle] = useState("");
  const [signerName, setSignerName] = useState(wavoName || "");
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shared, setShared] = useState(false);

  const selected = documents.find((d) => d.id === selectedId) || documents[0] || null;
  const requiredCount = documents.filter((d) => d.requiresSignature).length;
  const packetBytes = documents.reduce((sum, d) => sum + d.file.size, 0);

  function addFiles(event) {
    const incoming = Array.from(event.target.files || []);
    event.target.value = "";
    if (!incoming.length) return;
    if (documents.length + incoming.length > MAX_DOCUMENTS) return setError(`Packets can contain up to ${MAX_DOCUMENTS} PDFs.`);
    const invalid = incoming.find((f) => (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) || f.size > MAX_PDF_BYTES);
    if (invalid) return setError(`${invalid.name} must be a PDF under 15 MB.`);
    const nextBytes = packetBytes + incoming.reduce((sum, f) => sum + f.size, 0);
    if (nextBytes > MAX_PACKET_BYTES) return setError("That packet would be over 50 MB.");

    const added = incoming.map((file) => ({
      id: crypto.randomUUID(),
      file,
      requiresSignature: true,
      field: { ...DEFAULT_FIELD },
    }));
    const next = [...documents, ...added];
    setDocuments(next);
    setSelectedId(selectedId || added[0].id);
    setError("");
    if (!title) setTitle(incoming.length > 1 ? "Document packet" : incoming[0].name.replace(/\.pdf$/i, ""));
  }

  function patchDocument(id, patch) {
    setDocuments((docs) => docs.map((d) => d.id === id ? { ...d, ...patch } : d));
  }

  function removeDocument(id) {
    const next = documents.filter((d) => d.id !== id);
    setDocuments(next);
    if (selectedId === id) setSelectedId(next[0]?.id || null);
  }

  async function createContract() {
    if (!user || !documents.length || !title.trim()) return;
    if (!requiredCount) return setError("Keep at least one PDF set to Signature. Review-only PDFs can be included alongside it.");
    setBusy(true);
    setError("");
    const contractId = crypto.randomUUID();
    const uploaded = [];
    try {
      for (const doc of documents) {
        const path = `${user.id}/${contractId}/${doc.id}-${safeName(doc.file.name)}`;
        const { error: uploadError } = await supabase.storage.from("tidetracts-pdfs").upload(path, doc.file, { contentType: "application/pdf", upsert: false });
        if (uploadError) throw uploadError;
        uploaded.push({ ...doc, path });
      }

      const firstRequired = uploaded.find((d) => d.requiresSignature) || uploaded[0];
      const { data: contract, error: contractError } = await supabase.from("tidetracts_contracts").insert({
        id: contractId,
        owner_id: user.id,
        title: title.trim(),
        original_path: uploaded[0].path,
        signer_name: signerName.trim() || null,
        signature_field: firstRequired.field,
        status: "sent",
      }).select("id,title,share_token,status").single();
      if (contractError) throw contractError;

      const documentRows = uploaded.map((doc, position) => ({
        id: doc.id,
        contract_id: contractId,
        file_name: doc.file.name.slice(0, 240),
        original_path: doc.path,
        requires_signature: doc.requiresSignature,
        signature_field: doc.field,
        position,
      }));
      const { error: docsError } = await supabase.from("tidetracts_documents").insert(documentRows);
      if (docsError) throw docsError;

      setCreated({ ...contract, documentCount: documents.length, requiredCount });
    } catch (err) {
      if (uploaded.length) await supabase.storage.from("tidetracts-pdfs").remove(uploaded.map((d) => d.path));
      await supabase.from("tidetracts_contracts").delete().eq("id", contractId);
      setError(err?.message || "Couldn't create the packet.");
    } finally {
      setBusy(false);
    }
  }

  async function shareToWavo() {
    if (!created || !wavoKind || !wavoId) return;
    setBusy(true);
    setError("");
    const signUrl = `${window.location.origin}/sign/${created.share_token}`;
    const payload = JSON.stringify({
      v: 1,
      title: created.title,
      url: signUrl,
      token: created.share_token,
      status: "sent",
      documents: created.documentCount,
      required: created.requiredCount,
    });
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
      setError(err?.message || "Couldn't send this packet to Wavo.");
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    const signUrl = `${window.location.origin}/sign/${created.share_token}`;
    return (
      <main className="center-page done-page">
        <section className="done-card packet-done">
          <div className="done-check">✓</div>
          <span className="eyebrow">Packet ready</span>
          <h1>{created.title}</h1>
          <p>{created.documentCount} PDFs are bundled into one link. {created.requiredCount} require{created.requiredCount === 1 ? "s" : ""} a signature.</p>
          <div className="share-link"><input readOnly value={signUrl} /><button className="quiet" onClick={() => copyText(signUrl)}>Copy</button></div>
          {wavoKind && wavoId && <button className="wavo-button" disabled={busy || shared} onClick={shareToWavo}>{shared ? `Sent to ${wavoName || "Wavo"} ✓` : `Send to ${wavoName ? `@${wavoName}` : "Wavo"}`}</button>}
          <button className="primary" onClick={() => go("/")}>Back to dashboard</button>
          {error && <div className="error">{error}</div>}
        </section>
      </main>
    );
  }

  return (
    <main className="page packet-builder">
      <div className="new-head">
        <button className="back" onClick={() => go("/")}>←</button>
        <div><span className="eyebrow">New TideTract</span><h1>Build a PDF packet</h1><p>Bundle the paperwork. Choose exactly what needs signing.</p></div>
      </div>

      <input ref={fileInput} className="hidden-input" type="file" accept="application/pdf,.pdf" multiple onChange={addFiles} />

      {!documents.length ? (
        <button className="dropzone" onClick={() => fileInput.current?.click()}>
          <span className="upload-mark">↑</span>
          <strong>Add PDFs</strong>
          <span>Select one or several documents</span>
          <small>Up to 10 PDFs · 15 MB each · 50 MB total</small>
        </button>
      ) : (
        <div className="builder-grid">
          <aside className="builder-sidebar">
            <section className="setup-card stack">
              <div className="section-label"><span>Packet details</span><small>{documents.length} PDF{documents.length === 1 ? "" : "s"}</small></div>
              <label>Packet name<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="Agreement packet" /></label>
              <label>Who is signing?<input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Name (optional)" maxLength={120} /></label>
              <div className="packet-summary"><span><strong>{requiredCount}</strong> to sign</span><span><strong>{documents.length - requiredCount}</strong> review only</span><span><strong>{formatBytes(packetBytes)}</strong> total</span></div>
            </section>

            <section className="document-stack-card">
              <div className="section-label"><span>Documents</span><button className="text-button" onClick={() => fileInput.current?.click()}>+ Add PDFs</button></div>
              <div className="document-stack">
                {documents.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    doc={doc}
                    selected={selected?.id === doc.id}
                    onSelect={() => setSelectedId(doc.id)}
                    onToggle={() => patchDocument(doc.id, { requiresSignature: !doc.requiresSignature })}
                    onRemove={() => removeDocument(doc.id)}
                  />
                ))}
              </div>
            </section>

            {error && <div className="error">{error}</div>}
            <button className="primary create-packet" onClick={createContract} disabled={busy || !title.trim() || !documents.length}>{busy ? "Creating packet..." : `Create packet · ${requiredCount} signature${requiredCount === 1 ? "" : "s"}`}</button>
            {wavoKind && <small className="wavo-hint">After creating, send the whole packet straight back to {wavoName ? `@${wavoName}` : "this Wavo chat"}.</small>}
          </aside>

          <section className="preview-card builder-preview">
            <div className="preview-title">
              <div><strong>{selected?.file.name}</strong><span>{selected?.requiresSignature ? "Place the signature field" : "Review-only document"}</span></div>
              <span className={`preview-mode ${selected?.requiresSignature ? "required" : "review"}`}>{selected?.requiresSignature ? "Signature" : "Review only"}</span>
            </div>
            {selected?.requiresSignature ? (
              <PdfPlacement file={selected.file} field={selected.field} onField={(field) => patchDocument(selected.id, { field })} />
            ) : (
              <ReviewPreview file={selected.file} />
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function ReviewPreview({ file }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return <iframe className="local-pdf-frame" title={file.name} src={url} />;
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
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
        img.src = old;
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
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    canvasRef.current.setPointerCapture?.(e.pointerId);
  }
  function move(e) {
    if (!drawing.current) return;
    const p = point(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current.toDataURL("image/png"));
  }
  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }

  return <div className="signature-pad"><canvas ref={canvasRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} /><button type="button" className="clear-sign" onClick={clear}>Clear</button><span>Sign here</span></div>;
}

function SignContract({ token }) {
  const [contract, setContract] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [signature, setSignature] = useState("");
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${SIGN_FUNCTION_URL}?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || "Couldn't open packet");
        return body;
      })
      .then((body) => {
        setContract(body.contract);
        setName(body.contract.signerName || "");
        setActiveId(body.contract.documents?.[0]?.id || null);
      })
      .catch((err) => setError(err.message));
  }, [token]);

  const documents = contract?.documents || [];
  const active = documents.find((d) => d.id === activeId) || documents[0];
  const requiredCount = documents.filter((d) => d.requiresSignature).length;

  async function sign() {
    if (!signature || !name.trim() || !agree || !requiredCount) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(SIGN_FUNCTION_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, signatureData: signature, signedName: name.trim() }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Couldn't finish signing");
      setContract((current) => ({ ...current, status: "completed", signedAt: body.signedAt, documents: body.documents || current.documents }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !contract) return <main className="center-page"><section className="done-card"><div className="done-check bad">!</div><h1>Signing link unavailable</h1><p>{error}</p></section></main>;
  if (!contract) return <main className="center-page"><div className="empty">Opening secure packet...</div></main>;

  const completed = contract.status === "completed";

  return (
    <main className="sign-page">
      <header className="sign-head"><div className="brand static"><span className="brand-mark">T</span><span>TideTracts</span></div><span className="secure-pill">Private packet · {documents.length} PDF{documents.length === 1 ? "" : "s"}</span></header>
      <section className="sign-document">
        <div className="doc-head">
          <div><span className="eyebrow">{completed ? "Completed packet" : "Review packet"}</span><h1>{contract.title}</h1></div>
          <span className={`status ${completed ? "completed" : "sent"}`}>{completed ? "completed" : `${requiredCount} to sign`}</span>
        </div>
        <div className="sign-tabs">
          {documents.map((doc, index) => (
            <button key={doc.id} className={active?.id === doc.id ? "active" : ""} onClick={() => setActiveId(doc.id)}>
              <span>{index + 1}</span>
              <strong>{doc.fileName}</strong>
              <small>{doc.requiresSignature ? (completed ? "Signed" : "Signature required") : "Review only"}</small>
            </button>
          ))}
        </div>
        {active?.pdfUrl ? <iframe title={active.fileName} src={active.pdfUrl} /> : <div className="empty">PDF unavailable</div>}
      </section>

      <aside className="sign-panel">
        {completed ? (
          <>
            <div className="done-check">✓</div>
            <span className="eyebrow">Finished</span>
            <h2>Packet complete.</h2>
            <p>{contract.signedAt ? `Completed ${formatDate(contract.signedAt)}.` : "Everything is complete."}</p>
            <div className="completed-list">
              {documents.map((doc) => <a key={doc.id} href={doc.pdfUrl} target="_blank" rel="noreferrer"><span>{doc.requiresSignature ? "✓" : "PDF"}</span><strong>{doc.fileName}</strong><small>{doc.requiresSignature ? "Signed copy" : "Review copy"}</small></a>)}
            </div>
          </>
        ) : (
          <>
            <span className="eyebrow">One signature</span>
            <h2>Sign the packet once.</h2>
            <p>Your signature will be placed onto all {requiredCount} PDF{requiredCount === 1 ? "" : "s"} marked as required. Review-only PDFs stay untouched.</p>
            <div className="sign-summary"><span><strong>{requiredCount}</strong> signatures</span><span><strong>{documents.length - requiredCount}</strong> review only</span></div>
            <label>Full name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={120} /></label>
            <SignaturePad onChange={setSignature} />
            <label className="agree"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /><span>I have reviewed this packet and agree to sign the documents marked as requiring my signature electronically.</span></label>
            {error && <div className="error">{error}</div>}
            <button className="primary sign-finish" onClick={sign} disabled={busy || !signature || !name.trim() || !agree}>{busy ? "Finishing packet..." : `Sign ${requiredCount} PDF${requiredCount === 1 ? "" : "s"} & finish`}</button>
            <small className="fine-print">TideTracts records the signing time and creates completed copies of the signed PDFs. Some document types can have additional legal requirements.</small>
          </>
        )}
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
    return () => {
      window.removeEventListener("popstate", pop);
      data.subscription.unsubscribe();
    };
  }, []);

  if (current.name === "sign") return <SignContract token={current.token} />;
  if (user === undefined) return <main className="center-page"><div className="empty">Loading TideTracts...</div></main>;
  if (!user) return <Login onSignedIn={setUser} />;
  return <Shell user={user}>{current.name === "new" ? <NewContract user={user} /> : <Home user={user} />}</Shell>;
}
