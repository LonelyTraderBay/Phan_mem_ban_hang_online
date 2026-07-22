import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Without this, each render() in a test file leaves its DOM tree mounted for the next test,
// causing false "multiple elements found" failures.
afterEach(() => {
  cleanup();
});
