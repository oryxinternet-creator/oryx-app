import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Remove a tela de abertura (logo + slogan) após o app montar, com um tempo mínimo de exibição
const tiraSplash = () => {
  const s = document.getElementById("app-splash");
  if (!s) return;
  s.style.opacity = "0";
  setTimeout(() => s.remove(), 500);
};
setTimeout(tiraSplash, 900);
