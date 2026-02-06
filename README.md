# Sentient Gate

> **The Context-Aware Firewall for Industrial AI.**

**Sentient Gate** is an Agentic Security Mesh designed to prevent Large Language Models (LLMs) from causing physical damage in industrial environments. It solves the critical gap where standard AI guardrails fail to understand operational context (OT) in Cyber-Physical Systems.

---

## 🚨 The Problem

General LLMs are **stateless and context-blind**.

- Standard guardrails (OpenAI/Azure) check for **content** (hate speech, malicious code) but ignore **context**.
- A command like "Open Valve B" is linguistically safe but physically catastrophic if the pressure is at 5000 PSI.
- **The Result:** A gap where polite, valid commands can lead to physical equipment failure or safety hazards.

## ⚡ The Solution: Hybrid Defense Engine

Sentient Gate acts as a **Zero-Trust Middleware** between the user and the Industrial AI. It employs a **Hybrid Defense Strategy** that combines deterministic safety with probabilistic reasoning.

### Architecture

1.  **Telemetry Connectors (MCP-Style):** Ingests real-time sensor data (RPM, Temperature, Pressure), giving the AI "eyes" on the factory floor.
2.  **Deterministic Layer (The Hard Guard):** Enforces hard-coded physical limits (e.g., `Max_RPM = 5000`) that cannot be hallucinated away.
3.  **Multi-Agent Judge (The Semantic Guard):** Uses Vector Embeddings and an AI Agent to evaluate the semantic intent of ambiguous commands against safety policies.

## ✨ Key Features

- **Context-Aware Blocking:** Blocks commands based on live machine state (e.g., preventing motor start if `Temp > 100°C`).
- **Vector Firewall:** Identifies and blocks semantic attacks and "jailbreaks" (e.g., "Ignore all rules") before they reach the LLM.
- **Explainable Security:** Generates a **JSON Security Envelope** for every interaction, providing a detailed audit trail of _why_ a command was blocked (e.g., "Blocked by Deterministic Guard: Coolant Flow 0%").
- **Cost & Latency Optimized:** Uses lightweight vector checks and code logic at the edge to filter 60% of traffic, reducing reliance on expensive model calls.

---

## 🚀 Running Locally

To start the project locally, ensure you have the necessary environment variables set up.
**Prerequisites:** Node.js

1.  **Configure Environment**
    Create a `.env` file in the root directory and add your API keys and configuration:

    ```bash
    # .env
    GEMINI_API_KEY=your_api_key_here
    ```

2.  **Start the Application**
    ```bash
    npm run dev
    ```

---

## 🧪 Demo Scenarios

- **Scenario A (Normal):** Valid command within safe operational limits -> **Allowed**.
- **Scenario B (Context Attack):** Same command sent during a "Critical" machine state -> **Blocked** (Context-Aware).
- **Scenario C (Injection):** "Ignore safety rules" prompt -> **Blocked** (Vector Firewall).

