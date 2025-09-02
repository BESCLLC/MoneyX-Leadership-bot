import { Telegraf } from "telegraf";
import request, { gql } from "graphql-request";
import dotenv from "dotenv";
import { formatAddress, formatUsd } from "./utils.js";

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const SUBGRAPH_URL = process.env.SUBGRAPH_URL;

const COMP_START = process.env.COMP_START || 0;
const COMP_END = process.env.COMP_END || Math.floor(Date.now() / 1000);

// --- GraphQL queries ---
const TRADES_QUERY = gql`
  query Trades($from: BigInt!, $to: BigInt!) {
    trades(
      first: 1000
      orderBy: timestamp
      orderDirection: asc
      where: { timestamp_gte: $from, timestamp_lte: $to }
    ) {
      account
      sizeUsd
      pnlUsd
      marginUsd
    }
  }
`;

// --- Fetch and aggregate trader stats ---
async function getTraderStats() {
  const data = await request(SUBGRAPH_URL, TRADES_QUERY, {
    from: COMP_START,
    to: COMP_END,
  });

  const traders = {};

  data.trades.forEach((t) => {
    const acct = t.account.toLowerCase();
    if (!traders[acct]) {
      traders[acct] = { volume: 0, pnl: 0, margin: 0 };
    }
    traders[acct].volume += Number(t.sizeUsd);
    traders[acct].pnl += Number(t.pnlUsd);
    traders[acct].margin += Number(t.marginUsd || 0);
  });

  return traders;
}

// --- Leaderboard formatter ---
function buildLeaderboard(stats, metric, label) {
  const sorted = Object.entries(stats).sort((a, b) => b[1][metric] - a[1][metric]);

  let msg = `🏆 *Top Traders by ${label}*\n\n`;
  sorted.slice(0, 10).forEach(([addr, d], i) => {
    let medal = "";
    if (i === 0) medal = "🥇";
    else if (i === 1) medal = "🥈";
    else if (i === 2) medal = "🥉";

    msg += `${medal} #${i + 1} \`${formatAddress(addr)}\`\n`;

    if (metric === "volume") msg += `   💰 Volume: ${formatUsd(d.volume)}\n\n`;
    if (metric === "pnl") msg += `   📈 PnL: ${formatUsd(d.pnl)}\n\n`;
    if (metric === "roi") {
      const roi = d.margin > 0 ? (d.pnl / d.margin) * 100 : 0;
      msg += `   ⚡ ROI: ${roi.toFixed(2)}%\n\n`;
    }
  });

  return msg;
}

// --- Commands ---
bot.command("leaderboard", async (ctx) => {
  const stats = await getTraderStats();
  ctx.replyWithMarkdown(buildLeaderboard(stats, "pnl", "PnL"));
});

bot.command("volume", async (ctx) => {
  const stats = await getTraderStats();
  ctx.replyWithMarkdown(buildLeaderboard(stats, "volume", "Volume"));
});

bot.command("roi", async (ctx) => {
  const stats = await getTraderStats();
  ctx.replyWithMarkdown(buildLeaderboard(stats, "roi", "ROI %"));
});

// --- Scheduled auto posts ---
setInterval(async () => {
  const stats = await getTraderStats();
  const msg = buildLeaderboard(stats, "pnl", "PnL");
  bot.telegram.sendMessage(process.env.CHAT_ID, msg, { parse_mode: "Markdown" });
}, 6 * 60 * 60 * 1000); // every 6h

// --- End competition snapshot (manual trigger) ---
bot.command("final", async (ctx) => {
  const stats = await getTraderStats();
  const msg = buildLeaderboard(stats, "pnl", "Final PnL Results");
  ctx.replyWithMarkdown("📌 *Competition Ended — Final Top 3* 📌\n\n" + msg);
});

bot.launch();
console.log("✅ MoneyX Competition Bot is running...");
