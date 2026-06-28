import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Mentor from "./Mentor";
import "./styles.css";

// 역할 라우팅:
//   - 기본( ?role 없음 )        → 멘티 화면(App)
//   - ?role=mentor              → 멘토 화면(Mentor)
// 같은 채팅방을 보려면 두 화면 모두 같은 ?room=값을 쓰면 된다. (미지정 시 기본 공유 방)
const role = new URLSearchParams(window.location.search).get("role");
const isMentorView = role === "mentor";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isMentorView ? <Mentor /> : <App />}</React.StrictMode>,
);
