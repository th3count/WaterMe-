/**
 * utils.ts - Shared utilities for UI components
 * 
 * 🤖 AI ASSISTANT: For complete system understanding, reference ~/rules/ documentation:
 * 📖 System Overview: ~/rules/system-overview.md
 * 🏗️ Project Structure: ~/rules/project-structure.md
 * 🌐 API Patterns: ~/rules/api-patterns.md
 * 💻 Coding Standards: ~/rules/coding-standards.md
 */

export function getApiBaseUrl() {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl) return envUrl;
  return `http://${window.location.hostname}:5000`;
} 