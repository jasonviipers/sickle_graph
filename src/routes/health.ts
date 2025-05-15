import { Route } from "@elizaos/core";

export const health: Route = {
    path: '/health',
    type: 'GET',
    handler: async (req, res) => {
        res.json({ status: 'ok', });
    },
}