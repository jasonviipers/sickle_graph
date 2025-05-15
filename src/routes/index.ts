import { Route } from "@elizaos/core";
import { SickleGraphService } from "../services/sickle-graph-service";

/**
 * REST API endpoints for SickleGraph knowledge graph
 */
export const SickleGraphRoutes: Route[] = [
    {
        path: '/genes',
        type: 'GET',
        handler: async (req, res) => {
            const service = req.runtime.getService('sicklegraph') as SickleGraphService;
            const query = req.query.q as string;
            const limit = parseInt(req.query.limit as string) || 10;
            
            try {
                const results = await service?.searchGenes(query, limit);
                res.json(results);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        }
    },
    {
        path: '/genes/:id',
        type: 'GET',
        handler: async (req, res) => {
            const service = req.runtime.getService('sicklegraph') as SickleGraphService;
            
            try {
                const gene = await service?.getGene(req.params.id);
                if (!gene) {
                    return res.status(404).json({ error: 'Gene not found' });
                }
                res.json(gene);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        }
    },
    {
        path: '/variants/:id/trials',
        type: 'GET',
        handler: async (req, res) => {
            const service = req.runtime.getService('sicklegraph') as SickleGraphService;;
            const region = req.query.region as string || 'Africa';
            
            try {
                const trials = await service?.findTrialsForVariant(req.params.id, region);              
                res.json(trials);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        }
    },
    {
        path: '/data/import',
        type: 'POST',
        handler: async (req, res) => {
            const service = req.runtime.getService('sicklegraph') as SickleGraphService;;
            const { type, data } = req.body;
            
            if (!type || !data) {
                return res.status(400).json({ error: 'Missing type or data' });
            }
            
            try {
                switch (type) {
                    case 'genes':
                        await service?.importGeneData(data);
                        break;
                    // Add other import types
                    default:
                        return res.status(400).json({ error: 'Invalid data type' });
                }
                
                res.json({ status: 'success' });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        }
    }
];