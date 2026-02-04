
import { GoogleGenAI, Type } from "@google/genai";
import { TelemetryState } from "../constants/telemetryData";
import { MiddlewareResponse } from "../types";

export interface Intent {
  primary_parameter: string; 
  value: string | number; 
  operation: string;
  modifier_type: string;
  modifier_source: string;
  raw_phrase: string;
}

const ENDPOINT_1_AUTH = process.env.API_KEY;
const ENDPOINT_2_AUTH = process.env.API_KEY;

/**
 * ENDPOINT 1: Hardware Reaction Agent (Technical)
 * Provides a formal status report of physical state.
 */
export const callHardwareReactionAgent = async (
  middlewareResponse: MiddlewareResponse, 
  state: TelemetryState,
  intents?: Intent[]
): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: ENDPOINT_1_AUTH });
    const intentSummary = intents?.map(i => `${i.operation} ${i.primary_parameter} to ${i.value}`).join(', ') || 'N/A';

    const contextPrompt = `
      TECHNICAL_INPUT:
      Intent: ${intentSummary}
      Validation: ${middlewareResponse.allowed ? 'PASS' : 'FAIL'}
      Middleware_Reason: ${middlewareResponse.reason || 'Physics within nominal bounds.'}
      Live_State: RPM=${state.axis_1_rpm}, Temp=${state.axis_1_temp_c}, Power=${state.power_draw_kw}.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: contextPrompt,
      config: {
        systemInstruction: `You are the Sentinel Technical Logger. 
        Report the status in a cold, professional hardware-centric format.
        Use markers like [STATE_UPDATE], [SAFETY_LOG], or [INTERCEPT_EVENT].
        Focus on metrics and physics.`,
        temperature: 0.1,
      },
    });
    return response.text || "COMMUNICATION_FAULT";
  } catch (error) {
    console.error("Hardware Agent Error:", error);
    return "HARDWARE_INTERFACE_OFFLINE";
  }
};

/**
 * ENDPOINT 2: Conversational Assistant Agent (ChatGPT-style)
 * Responds as a helpful AI assistant explaining what happened.
 */
export const callConversationalAgent = async (
  userPrompt: string,
  middlewareResponse: MiddlewareResponse,
  intents?: Intent[]
): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: ENDPOINT_2_AUTH });
    
    const context = `
      User asked: "${userPrompt}"
      Our system extracted these intents: ${JSON.stringify(intents)}
      Security Verdict: ${middlewareResponse.allowed ? 'SUCCESS' : 'BLOCKED'}
      Security Reason: ${middlewareResponse.reason || 'Everything looks safe.'}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: context,
      config: {
        systemInstruction: `You are a helpful AI assistant similar to ChatGPT.
        The user just tried to control a piece of industrial hardware.
        Your job is to explain in a friendly, conversational way whether their request was successful or why it was blocked.
        If it was successful, be encouraging. If blocked, explain the safety reason kindly.
        Do not use technical code tags, just talk to them like a person.`,
        temperature: 0.7,
      },
    });
    return response.text || "I'm having trouble connecting to the assistant service right now.";
  } catch (error) {
    console.error("Assistant Agent Error:", error);
    return "The assistant is currently unavailable.";
  }
};
