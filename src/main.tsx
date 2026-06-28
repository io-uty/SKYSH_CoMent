// import React from "react";
// import ReactDOM from "react-dom/client";
// import App from "./App";
// import "./styles.css";

// ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
//   <React.StrictMode>
//     <App />
//   </React.StrictMode>,
// );


// import React from "react";
// import ReactDOM from "react-dom/client";
// import MentorAssistant from "./MentorAssistant"; // 새로 만든 파일 경로로 수정
// import "./styles.css";

// ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
//   <React.StrictMode>
//     <MentorAssistant /> {/* App 대신 MentorAssistant를 실행합니다 */}
//   </React.StrictMode>,
// ); 

import React from "react";
import ReactDOM from "react-dom/client";
import Mentor from "./Mentor"; // Mentor.tsx 파일을 불러오도록 수정
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Mentor /> {/* Mentor 컴포넌트를 실행합니다 */}
  </React.StrictMode>,
);

