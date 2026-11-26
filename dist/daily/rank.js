import { extraGames, extraScoreLabel, lowerIsBetter, } from "../games/extra-score.js";
const requests = new Map();
export async function showRank(container, result, score) {
    const key = JSON.stringify(result);
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    container.replaceChildren(status);
    container.hidden = true;
    if (!requests.has(key)) {
        const submit = async () => {
            const response = await fetch("/api/daily-score", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: key,
                keepalive: true,
                signal: AbortSignal.timeout(15000),
            });
            if ([404, 405, 501].includes(response.status))
                return null;
            if (!response.ok)
                throw new Error("Score submission failed");
            return response.json();
        };
        // Serialize the first submissions across tabs while the browser receives its cookie.
        const request = navigator.locks
            ? navigator.locks.request("dailyo-score", submit)
            : submit();
        requests.set(key, request);
    }
    try {
        const rank = await requests.get(key);
        if (!rank)
            return;
        const { lower, tied, others } = rank;
        container.hidden = false;
        if (!others)
            status.textContent = "First finisher today";
        else if (lower) {
            const percent = Math.floor((100 * lower) / others);
            const comparison = lowerIsBetter(result.game)
                ? "You placed ahead of"
                : "You scored higher than";
            status.textContent = percent
                ? `${comparison} ${percent}% of today’s other finishers`
                : `${comparison} ${lower} of ${others} other finishers today`;
        }
        else if (tied)
            status.textContent = `${tied} other ${tied === 1 ? "finisher" : "finishers"} tied your score`;
        else
            status.textContent = `Your rank today is ${others + 1} of ${others + 1}`;
        if (rank.score !== score) {
            const first = result.game === "maprot"
                ? `${rank.score.toLocaleString("en")} km off`
                : extraGames.includes(result.game)
                    ? extraScoreLabel(result.game, rank.score)
                    : rank.score;
            status.prepend(`Your first score today was ${first}. `);
        }
    }
    catch {
        requests.delete(key);
    }
}
//# sourceMappingURL=rank.js.map