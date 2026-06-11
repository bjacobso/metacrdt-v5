import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Home } from "./pages/Home";

const About = lazy(() =>
  import("./pages/About").then((module) => ({ default: module.About })),
);
const DemoGallery = lazy(() =>
  import("./pages/DemoGallery").then((module) => ({ default: module.DemoGallery })),
);
const DemoPipeline = lazy(() =>
  import("./pages/DemoPipeline").then((module) => ({ default: module.DemoPipeline })),
);

export function App() {
  return (
    <Suspense fallback={<main className="route-loading">Loading...</main>}>
      <Routes>
        <Route element={<Home />} path="/" />
        <Route element={<About />} path="/about" />
        <Route element={<DemoGallery />} path="/demo" />
        <Route element={<DemoPipeline />} path="/demo/:pipelineId" />
        <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
    </Suspense>
  );
}
