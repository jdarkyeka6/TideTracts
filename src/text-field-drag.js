import "./text-field-drag.css";

// Adds direct pointer dragging to creator-side text fields without touching
// controlled inputs or React form state. The existing PdfPlacement click
// handler remains the single source of truth for converting screen coords to
// normalized PDF coords.
let drag = null;
let frame = 0;
let lastPoint = null;

function placementFor(field) {
  return field?.closest?.(".pdf-placement") || null;
}

function moveSelectedField() {
  frame = 0;
  if (!drag || !lastPoint) return;
  const placement = placementFor(drag.field);
  if (!placement) return;

  placement.dispatchEvent(new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    clientX: lastPoint.x,
    clientY: lastPoint.y,
    view: window,
  }));
}

function scheduleMove(x, y) {
  lastPoint = { x, y };
  if (!frame) frame = requestAnimationFrame(moveSelectedField);
}

function endDrag(pointerId) {
  if (!drag || (pointerId != null && drag.pointerId !== pointerId)) return;
  const field = drag.field;
  if (lastPoint) moveSelectedField();
  field?.classList.remove("is-dragging");
  document.documentElement.classList.remove("tidetracts-field-dragging");
  drag = null;
  lastPoint = null;
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
}

document.addEventListener("pointerdown", (event) => {
  const field = event.target.closest?.(".pdf-placement .text-field-box");
  if (!field || event.button !== 0) return;

  // Select the field in React first, then use the existing placement click
  // logic while the pointer moves.
  field.click();
  drag = { field, pointerId: event.pointerId };
  lastPoint = { x: event.clientX, y: event.clientY };
  field.classList.add("is-dragging");
  document.documentElement.classList.add("tidetracts-field-dragging");
  field.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}, true);

document.addEventListener("pointermove", (event) => {
  if (!drag || drag.pointerId !== event.pointerId) return;
  scheduleMove(event.clientX, event.clientY);
  event.preventDefault();
}, true);

document.addEventListener("pointerup", (event) => {
  if (!drag || drag.pointerId !== event.pointerId) return;
  scheduleMove(event.clientX, event.clientY);
  endDrag(event.pointerId);
  event.preventDefault();
}, true);

document.addEventListener("pointercancel", (event) => endDrag(event.pointerId), true);
window.addEventListener("blur", () => endDrag());
