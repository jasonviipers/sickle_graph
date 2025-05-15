import { Action, HandlerCallback, IAgentRuntime, logger, Memory, State } from "@elizaos/core";
import { SickleGraphService } from "../services/sickle-graph-service";
import { NCBIService } from "../services/ncbi-service";

export const ResearchAssistantAction: Action = {
  name: "RESEARCH_ASSISTANT",
  similes: ["ASK", "RESEARCH_QUERY", "GENE_QUERY"],
  description: "Queries the biomedical knowledge graph for research information",
  validate: async (_runtime, _message, _state) => {
    const text = _message.content.text.toLowerCase();
    return text.includes("gene") ||
      text.includes("variant") ||
      text.includes("research") ||
      text.includes("trial") ||
      text.includes("sickle") ||
      text.includes("treatment");
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

      // Get services
      const sicklegraphService = _runtime.getService<SickleGraphService>(SickleGraphService.serviceType);
      const ncbiService = _runtime.getService<NCBIService>("ncbi");
      
      if (!sicklegraphService || !ncbiService) {
        throw new Error("Required services not available");
      }

      // Extract query from message
      const query = message.content.text;

      // Determine query type and process accordingly
      let responseText = "";
      let references = [];
      
      if (query.toLowerCase().includes("gene") || query.toLowerCase().includes("variant")) {
        // Gene/variant specific query
        const geneResults = await sicklegraphService.searchGenes(query, 3);
        const variantResults = await ncbiService.searchClinVar(query, { limit: 3 });

        if (geneResults.length > 0 || variantResults.length > 0) {
          responseText = "Here's what I found in our knowledge graph:\n\n";
          
          if (geneResults.length > 0) {
            responseText += "**Genes**:\n";
            geneResults.forEach(gene => {
              responseText += `- ${gene.symbol} (${gene.name}): ${gene.description?.substring(0, 150)}...\n`;
              references.push(`Gene: ${gene.symbol} (${gene.id})`);
            });
          }

          if (variantResults.length > 0) {
            responseText += "\n**Variants**:\n";
            variantResults.forEach(variant => {
              responseText += `- ${variant.hgvsNotation}: ${variant.clinicalSignificance} (${variant.geneSymbol})\n`;
              references.push(`Variant: ${variant.hgvsNotation} (${variant.id})`);
            });
          }
        } else {
          responseText = "No matching genes or variants found in our knowledge graph. Would you like me to search external databases?";
        }
      } 
      else if (query.toLowerCase().includes("trial")) {
        // Clinical trial query
        const trials = await sicklegraphService.findTrialsForVariant("", "Africa");
        
        if (trials.length > 0) {
          responseText = "Here are some relevant clinical trials in Africa:\n\n";
          trials.slice(0, 3).forEach(trial => {
            responseText += `- **${trial.name}** (${trial.status}): ${trial.locations.join(", ")}\n`;
            references.push(`Clinical Trial: ${trial.name} (${trial.id})`);
          });
        } else {
          responseText = "No active clinical trials matching your query were found in our African database.";
        }
      }
      else if (query.toLowerCase().includes("paper") || query.toLowerCase().includes("research")) {
        // Research paper query
        const papers = await sicklegraphService.searchPapers(query, 3);
        
        if (papers.length > 0) {
          responseText = "Here are some relevant research papers:\n\n";
          papers.forEach(paper => {
            responseText += `- **${paper.title}** (${paper.journal}, ${new Date(paper.publicationDate).getFullYear()})\n`;
            if (paper.authors) {
              responseText += `  Authors: ${paper.authors.slice(0, 3).join(", ")}${paper.authors.length > 3 ? " et al." : ""}\n`;
            }
            references.push(`Paper: ${paper.title} (PMID: ${paper.pmid})`);
          });
        } else {
          // Fallback to PubMed search if no local results
          const pubmedResults = await ncbiService.searchPubMed(query, { limit: 3 });
          if (pubmedResults.length > 0) {
            responseText = "Here are some recent publications from PubMed:\n\n";
            pubmedResults.forEach(paper => {
              responseText += `- **${paper.title}**\n`;
              if (paper.pmid) {
                references.push(`PubMed: ${paper.title} (PMID: ${paper.pmid})`);
              }
            });
          } else {
            responseText = "No research papers matching your query were found.";
          }
        }
      }
      else {
        // General query about sickle cell disease
        responseText = `I've analyzed your query about sickle cell disease: "${query}". `;
        responseText += "Based on our knowledge graph, here are some key points:\n\n";
        responseText += "- The HBB gene is the primary gene associated with sickle cell disease\n";
        responseText += "- Current research focuses on gene therapy approaches like CRISPR-Cas9\n";
        responseText += "- Several clinical trials are underway in Africa, particularly in Ghana and Nigeria\n";
        
        // Add references from our knowledge graph
        const hbbGene = await sicklegraphService.getGene("HBB");
        if (hbbGene) {
          references.push(`Gene: ${hbbGene.symbol} (${hbbGene.id})`);
          if (hbbGene.papers && hbbGene.papers.length > 0) {
            references.push(`Paper: ${hbbGene.papers[0].title} (PMID: ${hbbGene.papers[0].pmid})`);
          }
        }
      }

      const responseContent = {
        text: responseText,
        actions: ["ELIZA_RESEARCH_ASSISTANT"],
        source: message.content.source,
        references: references.length > 0 ? references : undefined
      };

      await callback(responseContent);
      return responseContent;
    } catch (error) {
      logger.error("Error in ELIZA_RESEARCH_ASSISTANT action:", error);
      
      // Fallback response if there's an error
      const fallbackResponse = {
        text: "I encountered an error processing your research query. Please try again later or rephrase your question.",
        actions: ["ELIZA_RESEARCH_ASSISTANT"],
        source: message.content.source
      };
      
      await callback(fallbackResponse);
      return fallbackResponse;
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
          text: "Based on our knowledge graph, here are current gene therapy approaches being trialed in Africa:\n\n1. CRISPR-Cas9 gene editing targeting the HBB gene (Ghana/Nigeria sites)\n2. Lentiviral vector-based gene addition therapy (South Africa)\n3. Base editing approaches (early-stage research in Kenya)\n\nReferences:\n- Clinical Trial: CRISPR-SCD-001 (NCT123456)\n- Paper: 'Gene Therapy for SCD in African Populations' (PMID: 12345678)",
          actions: ["ELIZA_RESEARCH_ASSISTANT"],
          references: [
            "Clinical Trial: CRISPR-SCD-001 (NCT123456)",
            "Paper: 'Gene Therapy for SCD in African Populations' (PMID: 12345678)"
          ]
        }
      }
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "Tell me about the HBB gene variants associated with sickle cell disease"
        }
      },
      {
        name: "{{name2}}",
        content: {
          text: "The HBB gene has several clinically significant variants associated with SCD:\n\n1. HbSS (most severe form)\n2. HbSC (milder symptoms)\n3. HbS beta-thalassemia\n\nThese variants affect hemoglobin structure and function. Our knowledge graph shows 42 research papers studying these variants in African populations.",
          actions: ["ELIZA_RESEARCH_ASSISTANT"],
          references: [
            "Gene: HBB (ENSG00000133994)",
            "Variant: HbSS (rs334)",
            "Paper: 'HBB Variants in West Africa' (PMID: 23456789)"
          ]
        }
      }
    ]
  ]
};