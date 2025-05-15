import { Action, HandlerCallback, IAgentRuntime, logger, Memory, State } from "@elizaos/core";


export const ResearchAssistantAction: Action = {
  name: "RESEARCH_ASSISTANT",
  similes: ["ASK", "RESEARCH_QUERY", "GENE_QUERY"],
  description: "Queries the biomedical knowledge graph for research information",
  validate: async (_runtime, _message, _state) => {
    const text = _message.content.text.toLowerCase();
    return text.includes("gene") ||
      text.includes("variant") ||
      text.includes("research") ||
      text.includes("trial");
  },
  handler: async (
    _runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback,
    _responses: Memory[]) => {
    try {
      logger.info("Handling ELIZA_RESEARCH_ASSISTANT action");

      // Extract query from message
      const query = message.content.text;

      // Mock response for now - in a real implementation, this would use the ELIZA AI
      const responseContent = {
        text: `As your research assistant, I've analyzed your query: "${query}". Here's what I found in the literature...`,
        actions: ["ELIZA_RESEARCH_ASSISTANT"],
        source: message.content.source
      };

      await callback(responseContent);
      return responseContent;
    } catch (error) {
      logger.error("Error in ELIZA_RESEARCH_ASSISTANT action:", error);
      throw error;
    }
  },
  examples: [
    [
      {
        name: "{{name1}}",
        content: {
          text: "What are the latest gene therapy approaches for sickle cell disease in Africa?"
        }
      },
      {
        name: "{{name2}}",
        content: {
          text: "Based on recent literature, CRISPR-Cas9 gene editing is showing promise for sickle cell disease treatment in Africa. Several clinical trials are underway, with a focus on accessibility and affordability for resource-limited settings.",
          actions: ["ELIZA_RESEARCH_ASSISTANT"]
        }
      }
    ]
  ]
};
