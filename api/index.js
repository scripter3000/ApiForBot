const { kv } = require('@vercel/kv');

const relay = "https://discord.com/api/webhooks/1453079478052978914/HFQQNq-I3ZPAXXcq79KkrzjOg0sH2AbfQjNiYLPPV6hyNA8rjKihxLwI-c75yThfbMS";

async function pushUpdate() {
    const lastCheck = await kv.get('sync_ts');
    const now = Date.now();

    if (lastCheck && now - lastCheck < 300000) return;

    const stream = await kv.keys('occupancy_*');
    const data = [];

    for (const entry of stream) {
        const bot = await kv.get(entry);
        const remaining = await kv.ttl(entry);
        const id = entry.replace('occupancy_', '');
        if (bot) {
            data.push(`server: \`${id}\`\n user: \`${bot}\`\n expires: ${Math.floor(remaining / 60)}m ${remaining % 60}s`);
        }
    }

    if (data.length === 0) data.push("No active server locks.");

    await fetch(relay, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            embeds: [{
                title: "servers locked by bots",
                description: data.join('\n\n'),
                color: 5814783,
                timestamp: new Date().toISOString()
            }]
        })
    });

    await kv.set('sync_ts', now);
}

module.exports = async (req, res) => {
    const { method, body } = req;
    const { target, sender } = body || {};

    if (method === 'POST') {
        if (!target) return res.status(400).json({ error: 'invalid_req' });

        const slot = `occupancy_${target}`;
        const current = await kv.get(slot);

        if (current && current !== sender) {
            return res.status(409).json({ state: 'busy', user: current });
        }

        await kv.set(slot, sender, { ex: 600 });
        await pushUpdate();

        return res.status(200).json({ state: 'success' });
    }

    return res.status(405).json({ error: 'denied' });
};
