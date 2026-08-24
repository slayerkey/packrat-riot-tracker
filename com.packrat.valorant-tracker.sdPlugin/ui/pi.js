let websocket = null;
let uuid = null;
let actionUuid = "";
let localSettings = {};
let globalSettings = {};

const HENRIK_DASHBOARD_URL = "https://api.henrikdev.xyz/dashboard/";
const SLOT_ACTIONS = new Set([
	"com.packrat.valorant-tracker.top-agent",
	"com.packrat.valorant-tracker.agent-kd",
	"com.packrat.valorant-tracker.agent-win-rate",
	"com.packrat.valorant-tracker.top-map",
	"com.packrat.valorant-tracker.map-win-rate",
	"com.packrat.valorant-tracker.recent-match"
]);
const MANUAL_ACTIONS = new Set([
	"com.packrat.valorant-tracker.log-win",
	"com.packrat.valorant-tracker.log-loss"
]);

// Called by Stream Deck when the Property Inspector opens.
// eslint-disable-next-line no-unused-vars
function connectElgatoStreamDeckSocket(inPort, inUUID, inRegisterEvent, inInfo, inActionInfo) {
	uuid = inUUID;
	try {
		const info = JSON.parse(inActionInfo);
		actionUuid = info.action ?? "";
		localSettings = info.payload?.settings ?? {};
	} catch {
		actionUuid = "";
		localSettings = {};
	}

	websocket = new WebSocket(`ws://127.0.0.1:${inPort}`);
	websocket.onopen = () => {
		websocket.send(JSON.stringify({ event: inRegisterEvent, uuid: inUUID }));
		websocket.send(JSON.stringify({ event: "getGlobalSettings", context: inUUID }));
		build();
		render();
	};
	websocket.onmessage = (event) => {
		const message = JSON.parse(event.data);
		if (message.event === "didReceiveSettings") {
			localSettings = message.payload?.settings ?? {};
			render();
		}
		if (message.event === "didReceiveGlobalSettings") {
			globalSettings = message.payload?.settings ?? {};
			render();
		}
	};
}

function saveGlobal() {
	if (websocket?.readyState !== WebSocket.OPEN) return;
	websocket.send(JSON.stringify({ event: "setGlobalSettings", context: uuid, payload: globalSettings }));
}

function saveLocal() {
	if (websocket?.readyState !== WebSocket.OPEN) return;
	websocket.send(JSON.stringify({ event: "setSettings", context: uuid, payload: localSettings }));
}

function openUrl(url) {
	if (websocket?.readyState !== WebSocket.OPEN) return;
	websocket.send(JSON.stringify({ event: "openUrl", payload: { url } }));
}

function account() {
	return globalSettings.account ?? {};
}

function setAccountField(field, value) {
	globalSettings = {
		...globalSettings,
		account: {
			...account(),
			[field]: value || undefined
		}
	};
	saveGlobal();
}

function toLocalDateTime(value) {
	if (!value) return "";
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return "";
	const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
	return shifted.toISOString().slice(0, 16);
}

function fromLocalDateTime(value) {
	if (!value) return undefined;
	const date = new Date(value);
	return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function render() {
	const shared = account();
	const riotId = document.getElementById("riotId");
	if (riotId && document.activeElement !== riotId) riotId.value = shared.riotId ?? "";
	const region = document.getElementById("region");
	if (region) region.value = shared.region ?? "na";
	const apiKey = document.getElementById("apiKey");
	if (apiKey && document.activeElement !== apiKey) apiKey.value = shared.apiKey ?? "";
	const actEndDate = document.getElementById("actEndDate");
	if (actEndDate && document.activeElement !== actEndDate) actEndDate.value = toLocalDateTime(shared.actEndDate);

	const slotCard = document.getElementById("slotCard");
	if (slotCard) slotCard.classList.toggle("hidden", !SLOT_ACTIONS.has(actionUuid));
	const slot = document.getElementById("slot");
	if (slot) slot.value = String(localSettings.slot ?? 1);

	const manualRrCard = document.getElementById("manualRrCard");
	if (manualRrCard) manualRrCard.classList.toggle("hidden", !MANUAL_ACTIONS.has(actionUuid));
	const manualRr = document.getElementById("manualRr");
	if (manualRr && document.activeElement !== manualRr) manualRr.value = localSettings.manualRr ?? "";
}

function build() {
	document.getElementById("riotId")?.addEventListener("change", (event) => {
		setAccountField("riotId", event.target.value.trim());
	});
	document.getElementById("region")?.addEventListener("change", (event) => {
		setAccountField("region", event.target.value);
	});
	document.getElementById("apiKey")?.addEventListener("change", (event) => {
		setAccountField("apiKey", event.target.value.trim());
	});
	document.getElementById("openHenrikDashboard")?.addEventListener("click", () => {
		openUrl(HENRIK_DASHBOARD_URL);
	});
	document.getElementById("actEndDate")?.addEventListener("change", (event) => {
		setAccountField("actEndDate", fromLocalDateTime(event.target.value));
	});
	document.getElementById("slot")?.addEventListener("change", (event) => {
		localSettings = { ...localSettings, slot: Number(event.target.value) };
		saveLocal();
	});
	document.getElementById("manualRr")?.addEventListener("change", (event) => {
		const text = event.target.value.trim();
		const parsed = Number(text);
		localSettings = { ...localSettings, manualRr: text !== "" && Number.isFinite(parsed) ? Math.round(parsed) : undefined };
		saveLocal();
	});
}
