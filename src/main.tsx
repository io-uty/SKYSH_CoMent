
import React from "react";
import ReactDOM from "react-dom/client";
import Onboarding from "./Onboarding.tsx"; // 1. 온보딩 파일 임포트
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Onboarding /> {/* 2. 온보딩 컴포넌트 실행 */}
  </React.StrictMode>,
);
/*import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
*/