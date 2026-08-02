/**
 * Property inspector for both rank actions, one file. Talks the Stream Deck PI websocket
 * directly, so the plugin ships no third-party UI code. There is no team/account list to ask the
 * plugin for here (unlike the ESPN trackers' pi.js): every field is something only the user knows.
 */

let websocket = null;
let uuid = null;
let settings = {};

// eslint-disable-next-line no-unused-vars
function connectElgatoStreamDeckSocket(inPort, inUUID, inRegisterEvent, inInfo, inActionInfo) {
	uuid = inUUID;
	try {
		const info = JSON.parse(inActionInfo);
		settings = info.payload.settings ?? {};
	} catch {
		settings = {};
	}

	websocket = new WebSocket(`ws://127.0.0.1:${inPort}`);
	websocket.onopen = () => {
		websocket.send(JSON.stringify({ event: inRegisterEvent, uuid: inUUID }));
		build();
		render();
	};
	websocket.onmessage = (e) => {
		const msg = JSON.parse(e.data);
		if (msg.event === "didReceiveSettings") {
			settings = msg.payload.settings ?? {};
			render();
		}
	};
}

function save() {
	if (websocket?.readyState === WebSocket.OPEN) {
		websocket.send(JSON.stringify({ event: "setSettings", context: uuid, payload: settings }));
	}
}

function render() {
	const gameName = document.getElementById("gameName");
	if (gameName) gameName.value = settings.gameName ?? "";

	const tagLine = document.getElementById("tagLine");
	if (tagLine) tagLine.value = settings.tagLine ?? "";

	const platform = document.getElementById("platform");
	if (platform) platform.value = settings.platform ?? platform.options[0].value;

	const apiKey = document.getElementById("apiKey");
	if (apiKey) apiKey.value = settings.apiKey ?? "";
}

function build() {
	document.getElementById("gameName")?.addEventListener("change", (e) => {
		settings.gameName = e.target.value.trim() || undefined;
		save();
	});

	document.getElementById("tagLine")?.addEventListener("change", (e) => {
		settings.tagLine = e.target.value.trim().replace(/^#/, "") || undefined;
		save();
	});

	document.getElementById("platform")?.addEventListener("change", (e) => {
		settings.platform = e.target.value;
		save();
	});

	document.getElementById("apiKey")?.addEventListener("change", (e) => {
		settings.apiKey = e.target.value.trim() || undefined;
		save();
	});
}
