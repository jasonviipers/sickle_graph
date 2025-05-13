import { Route } from "@elizaos/core";

export const Routes: Route[] = [
    {
        path: '/health',
        type: 'GET',
        handler: async (req, res) => {
            res.json({ status: 'ok', });
        },
    },
    {
        path: '/genes',
        type: 'GET',
        handler: async (req, res) => {
            res.json({ status: 'ok', });
        },
    }
];