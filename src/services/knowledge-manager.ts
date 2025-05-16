import { IAgentRuntime, logger, createUniqueUuid, Semaphore } from '@elizaos/core';
import { Gene, ClinicalTrial, ResearchPaper, Variant } from '../types';
import { SickleGraphService } from './sickle-graph-service';
import { NCBIService } from './ncbi-service';

/**
 * Enterprise-grade Knowledge Manager for SickleGraph
 * Handles all dynamic knowledge loading operations with:
 * - Rate limiting
 * - Error resilience
 * - Metadata tagging
 * - Chunk optimization
 */
export class KnowledgeManager {
  private static readonly MAX_CONCURRENT_UPLOADS = 5;
  private static readonly DEFAULT_CHUNK_SIZE = 1500;
  private static readonly DEFAULT_OVERLAP = 150;

  constructor(
    private runtime: IAgentRuntime,
    private sicklegraphService: SickleGraphService,
    private ncbiService?: NCBIService
  ) {}

  /**
   * Initialize core biomedical knowledge base
   * Should be called during agent startup
   */
  public async initializeBaseKnowledge(): Promise<void> {
    try {
      logger.info('Initializing SickleGraph knowledge base');
      
      // Load in sequence: genes -> variants -> trials -> papers
      await this.loadCriticalGenes();
      await this.loadActiveTrials();
      await this.loadRecentResearch();

      logger.info('Knowledge base initialization complete');
    } catch (error) {
      logger.error('Knowledge base initialization failed', error);
      throw new Error(`Knowledge initialization failed: ${error.message}`);
    }
  }

  /**
   * Load high-priority genes with semantic chunking
   */
  private async loadCriticalGenes(): Promise<void> {
    const CRITICAL_GENES = ['HBB', 'HBA1', 'HBA2', 'BCL11A'];
    const semaphore = new Semaphore(KnowledgeManager.MAX_CONCURRENT_UPLOADS);

    await Promise.all(CRITICAL_GENES.map(async (geneSymbol) => {
      await semaphore.acquire();
      try {
        const genes = await this.sicklegraphService.searchGenes(geneSymbol);
        if (genes.length > 0) {
          await this.addGeneKnowledge(genes[0]);
        }
      } catch (error) {
        logger.warn(`Failed to load knowledge for gene ${geneSymbol}`, error);
      } finally {
        semaphore.release();
      }
    }));
  }

  /**
   * Standardized gene knowledge addition with metadata
   */
  public async addGeneKnowledge(gene: Gene): Promise<void> {
    const knowledgeContent = `
# Gene Profile: ${gene.symbol}
**Official Name**: ${gene.name}
**Chromosome**: ${gene.chromosome}
**Ensembl ID**: ${gene.ensemblId || 'N/A'}

## Description
${gene.description || 'No description available'}

## Clinical Significance
${this.generateVariantSummary(gene.variants)}
    `.trim();

    try {
      await this.runtime.addKnowledge({
        id: createUniqueUuid(this.runtime, `gene-${gene.id}`),
        content: {
          text: knowledgeContent,
          metadata: {
            entity_type: 'gene',
            symbol: gene.symbol,
            data_source: 'sicklegraph',
            priority: 'high',
            last_updated: new Date().toISOString()
          }
        }
      }, {
        targetTokens: 1200,
        overlap: 200,
        modelContextSize: 8192
      });
      logger.debug(`Successfully added knowledge for gene ${gene.symbol}`);
    } catch (error) {
      logger.error(`Failed to add gene knowledge for ${gene.symbol}`, error);
      throw error;
    }
  }

  /**
   * Load active clinical trials with geographic awareness
   */
  private async loadActiveTrials(region = 'Africa'): Promise<void> {
    try {
      const trials = await this.sicklegraphService.findTrialsForVariant('', region);
      const semaphore = new Semaphore(KnowledgeManager.MAX_CONCURRENT_UPLOADS);

      await Promise.all(trials.map(async (trial) => {
        await semaphore.acquire();
        try {
          await this.addTrialKnowledge(trial);
        } finally {
          semaphore.release();
        }
      }));
    } catch (error) {
      logger.error('Failed to load clinical trials knowledge', error);
      // Non-critical failure, continue operation
    }
  }

  /**
   * Standardized trial knowledge addition
   */
  public async addTrialKnowledge(trial: ClinicalTrial): Promise<void> {
    const knowledgeContent = `
# Clinical Trial: ${trial.name}
**Status**: ${trial.status}
**Phase**: ${trial.phase}
**Target Genes**: ${trial.targetGenes.join(', ')}

## Locations
${trial.locations.join('\n')}

## Timeline
**Start**: ${trial.startDate}
${trial.endDate ? `**End**: ${trial.endDate}` : ''}
    `.trim();

    try {
      await this.runtime.addKnowledge({
        id: createUniqueUuid(this.runtime, `trial-${trial.id}`),
        content: {
          text: knowledgeContent,
          metadata: {
            entity_type: 'clinical_trial',
            status: trial.status,
            phase: trial.phase,
            data_source: 'sicklegraph',
            region: 'Africa',
            last_updated: new Date().toISOString()
          }
        }
      }, {
        targetTokens: KnowledgeManager.DEFAULT_CHUNK_SIZE,
        modelContextSize: 8192, 
        overlap: KnowledgeManager.DEFAULT_OVERLAP
      });
    } catch (error) {
      logger.error(`Failed to add trial knowledge for ${trial.id}`, error);
      throw error;
    }
  }

  /**
   * Load recent research papers with fallback to PubMed
   */
  private async loadRecentResearch(limit = 20): Promise<void> {
    try {
      // First try local knowledge graph
      const localPapers = await this.sicklegraphService.searchPapersAdvanced({
        limit,
        toDate: new Date().toISOString()
      });

      if (localPapers.length > 0) {
        await this.batchAddPapers(localPapers);
      } else if (this.ncbiService) {
        // Fallback to NCBI
        const pubmedPapers = await this.ncbiService.searchPubMed(
          'sickle cell disease', 
          { limit }
        );
        await this.batchAddPapers(pubmedPapers);
      }
    } catch (error) {
      logger.error('Failed to load research papers', error);
      // Non-critical failure
    }
  }

  /**
   * Batch paper processing with progress tracking
   */
  public async batchAddPapers(papers: ResearchPaper[]): Promise<void> {
    const semaphore = new Semaphore(KnowledgeManager.MAX_CONCURRENT_UPLOADS);
    let successCount = 0;

    await Promise.all(papers.map(async (paper) => {
      await semaphore.acquire();
      try {
        await this.addPaperKnowledge(paper);
        successCount++;
      } catch (error) {
        logger.warn(`Failed to add paper ${paper.pmid || paper.id}`, error);
      } finally {
        semaphore.release();
      }
    }));

    logger.info(`Successfully processed ${successCount}/${papers.length} papers`);
  }

  /**
   * Standardized research paper knowledge addition
   */
  public async addPaperKnowledge(paper: ResearchPaper): Promise<void> {
    const knowledgeContent = `
# Research Paper: ${paper.title}
**Journal**: ${paper.journal}
**Publication Date**: ${paper.publicationDate}
**Authors**: ${paper.authors?.join(', ') || 'N/A'}

## Abstract
${paper.abstract || 'No abstract available'}

${paper.doi ? `**DOI**: ${paper.doi}` : ''}
    `.trim();

    try {
      await this.runtime.addKnowledge({
        id: createUniqueUuid(this.runtime, `paper-${paper.pmid || paper.id}`),
        content: {
          text: knowledgeContent,
          metadata: {
            entity_type: 'research_paper',
            publication_date: paper.publicationDate,
            data_source: paper.pmid ? 'pubmed' : 'sicklegraph',
            keywords: this.extractKeywords(paper),
            last_updated: new Date().toISOString()
          }
        }
      }, {
        targetTokens: 1800,  // Larger chunks for academic content
        modelContextSize: 8192,  //  modelContextSize parameter
        overlap: 200
      });
    } catch (error) {
      logger.error(`Failed to add paper knowledge ${paper.pmid || paper.id}`, error);
      throw error;
    }
  }

  // ==================== Utility Methods ====================
  
  private generateVariantSummary(variants?: Variant[]): string {
    if (!variants || variants.length === 0) return 'No known variants';
    
    const significant = variants.filter(v => 
      ['pathogenic', 'likely_pathogenic'].includes(v.clinicalSignificance)
    );
    
    return `
        Total Variants: ${variants.length}
        Clinically Significant: ${significant.length}

        Key Variants:
        ${significant.slice(0, 3).map(v => 
        `- ${v.hgvsNotation}: ${v.clinicalSignificance}`
        ).join('\n')}
            `.trim();
  }

  private extractKeywords(paper: ResearchPaper): string[] {
    const keywords = new Set<string>();
    
    // Add explicit keywords if available
    if (paper.keywords) {
      paper.keywords.forEach(kw => keywords.add(kw.toLowerCase()));
    }
    
    // Extract from title
    const titleTerms = paper.title.toLowerCase().split(/\W+/);
    ['sickle', 'gene', 'therapy', 'africa'].forEach(term => {
      if (titleTerms.includes(term)) keywords.add(term);
    });
    
    return Array.from(keywords);
  }
}