import React from "react";
import { createRoot } from "react-dom/client";
import { ToastProvider } from "@/components/toast";
import { App } from "./app";
import "./style.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>,
);
