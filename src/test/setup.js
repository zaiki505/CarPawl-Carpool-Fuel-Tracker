// Registers @testing-library/jest-dom matchers (toBeInTheDocument, etc.) on
// vitest's expect. Harmless in the node-env lib tests - the matchers only touch
// the DOM when actually invoked, which only happens in happy-dom component tests.
import "@testing-library/jest-dom/vitest";
