import { Action, Content, HandlerCallback, IAgentRuntime, logger, Memory, State } from "@elizaos/core";

export const knowledgeGraphQueryAction: Action = {
    name: "KNOWLEDGE_GRAPH_QUERY",
    similes: ["QUERY_GRAPH", "SEARCH_KNOWLEDGE_BASE"],
    description: "Queries the SickleGraph knowledge graph for biomedical information",
    validate: async (_runtime, _message, _state) => {
      return true;
    },
    handler: async (
      _runtime: IAgentRuntime,
      message: Memory,
      _state: State,
      _options: any,
      callback: HandlerCallback,
      _responses: Memory[]
    ) => {
      try {
        logger.info("Handling KNOWLEDGE_GRAPH_QUERY action");
  
        // Extract query from message
        const query = message.content.text;
  
        // Mock response for now - in a real implementation, this would query the knowledge graph
        const responseContent: Content = {
          text: `I've searched the SickleGraph knowledge graph for: "${query}". Here are the results...`,
          actions: ["KNOWLEDGE_GRAPH_QUERY"],
          source: message.content.source
        };
  
        await callback(responseContent);
        return responseContent;
      } catch (error) {
        logger.error("Error in KNOWLEDGE_GRAPH_QUERY action:", error);
        throw error;
      }
    },
    examples: [
      [
        {
          name: "{{name1}}",
          content: {
            text: "What genes are associated with sickle cell disease?"
          }
        },
        {
          name: "{{name2}}",
          content: {
            text: "Based on the SickleGraph knowledge graph, the HBB gene is primarily associated with sickle cell disease. The mutation in this gene leads to the production of abnormal hemoglobin S (HbS).",
            actions: ["KNOWLEDGE_GRAPH_QUERY"]
          }
        }
      ]
    ]
  };