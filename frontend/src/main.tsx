import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Portfolio from "./pages/Portfolio";
import "./index.css";

// No react-router — the app only has two real entry points, so a plain path
// check is enough and keeps the dependency list small.
const portfolioMatch = window.location.pathname.match(/^\/portfolio\/([^/]+)\/?$/);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {portfolioMatch ? <Portfolio slug={portfolioMatch[1]} /> : <App />}
  </React.StrictMode>
);
