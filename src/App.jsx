import React from "react";
import { AppProvider } from "./app/AppContext.jsx";
import { AppFrame } from "./components/AppFrame.jsx";

export default function App() {
  return (
    <AppProvider>
      <AppFrame />
    </AppProvider>
  );
}
