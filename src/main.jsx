import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Remove a tela de abertura (logo + slogan) apÃ³s o app montar, com um tempo mÃ­nimo de exibiÃ§Ã£o
const tiraSplash = () => {
  const s = document.getElementById("app-splash");
  if (!s) return;
  s.style.opacity = "0";
  setTimeout(() => s.remove(), 500);
};
setTimeout(tiraSplash, 500);
