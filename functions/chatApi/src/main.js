const sdk = require("node-appwrite");

/* ================== CONFIG ================== */

const ENDPOINT = "https://nyc.cloud.appwrite.io/v1";
const PROJECT_ID = "697b95cd000a52d5cf5b";

const DATABASE_ID = "697baca3000c020a5b31";
const CONVERSATIONS_COL = "conversations";
const MEMBERSHIPS_COL = "memberships";
const USERS_COL = "users";  

/* ================== CLIENT ================== */

const client = new sdk.Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const db = new sdk.Databases(client);
const users = new sdk.Users(client);

/* ================== HELPERS ================== */

function json(status, body) {
  return {
    statusCode: status,
    body: JSON.stringify(body),
  };
}

async function getBodyJson(req) {
  if (req.bodyJson && typeof req.bodyJson === "object") return req.bodyJson;
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
}

function genIntId() {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

/* ================== MAIN ================== */

module.exports = async (context) => {
  const { req, log } = context;

  try {
    const body = await getBodyJson(req);
    log("Received request body:", body);

    const { action, otherEmail } = body;

    if (!action) {
      return json(400, { ok: false, error: "MISSING_ACTION" });
    }

    const currentUserId = req.headers["x-appwrite-user-id"];
    if (!currentUserId) {
      return json(401, { ok: false, error: "UNAUTHORIZED" });
    }

    if (action === "createDm") {
      // return await createDm(currentUserId, otherEmail);
      if (action === "createDm") {
  const { otherEmail } = body;

  if (!otherEmail) {
    return json(400, { ok: false, error: "MISSING_OTHER_EMAIL" });
  }

  const list = await users.list([
    sdk.Query.equal("email", otherEmail),
    sdk.Query.limit(1),
  ]);

  if (!list.users || list.users.length === 0) {
    return json(404, { ok: false, error: "USER_NOT_FOUND" });
  }

  const otherUser = list.users[0];

  if (otherUser.$id === currentUserId) {
    return json(400, { ok: false, error: "CANNOT_DM_SELF" });
  }

  const perms = [
    `read("user:${currentUserId}")`,
    `read("user:${otherUser.$id}")`,
    `update("user:${currentUserId}")`,
    `update("user:${otherUser.$id}")`,
    `delete("user:${currentUserId}")`,
    `delete("user:${otherUser.$id}")`,
  ];

  const convo = await db.createDocument(
    DATABASE_ID,
    CONVERSATIONS_COL,
    sdk.ID.unique(),
    {
      type: "dm",
      createdAt: new Date().toISOString(),
      lastMessageText: "",
      lastMessageAt: null,
    },
    perms
  );

  await db.createDocument(
    DATABASE_ID,
    MEMBERSHIPS_COL,
    sdk.ID.unique(),
    {
      membershipId: genIntId(),
      teamId: 0,
      conversationId: convo.$id,
      userId: currentUserId,
    },
    perms
  );

  await db.createDocument(
    DATABASE_ID,
    MEMBERSHIPS_COL,
    sdk.ID.unique(),
    {
      membershipId: genIntId(),
      teamId: 0,
      conversationId: convo.$id,
      userId: otherUser.$id,
    },
    perms
  );

  return json(200, { ok: true, conversationId: convo.$id });
}

    }

    if (action === "listConversations") {
      return await listConversations(currentUserId);
    }

    return json(404, { ok: false, error: "UNKNOWN_ACTION" });

  } catch (e) {
    console.error(e);
    return json(500, { ok: false, error: e.message });
  }
};

/* ================== CREATE DM ================== */

async function createDm(currentUserId, otherEmail) {
  if (!otherEmail) {
    return json(400, { ok: false, error: "MISSING_OTHER_EMAIL" });
  }

  const list = await users.list([
    sdk.Query.equal("email", otherEmail),
    sdk.Query.limit(1),
  ]);

  if (list.users.length === 0) {
    return json(404, { ok: false, error: "USER_NOT_FOUND" });
  }

  const otherUser = list.users[0];

  if (otherUser.$id === currentUserId) {
    return json(400, { ok: false, error: "CANNOT_DM_SELF" });
  }

  const perms = [
  `read("user:${currentUserId}")`,
  `read("user:${otherUser.$id}")`,
  `update("user:${currentUserId}")`,
  `update("user:${otherUser.$id}")`,
  `delete("user:${currentUserId}")`,
  `delete("user:${otherUser.$id}")`,
];
  const convo = await db.createDocument(
    DATABASE_ID,
    CONVERSATIONS_COL,
    sdk.ID.unique(),
    {
      type: "dm",
      createdAt: new Date().toISOString(),
      lastMessageText: "",
      lastMessageAt: null,
    },
    perms
  );

  await db.createDocument(DATABASE_ID, MEMBERSHIPS_COL, sdk.ID.unique(), {
    membershipId: genIntId(),
    teamId: 0,
    conversationId: convo.$id,
    userId: currentUserId,
  }, perms);

  await db.createDocument(DATABASE_ID, MEMBERSHIPS_COL, sdk.ID.unique(), {
    membershipId: genIntId(),
    teamId: 0,
    conversationId: convo.$id,
    userId: otherUser.$id,
  }, perms);

  return json(200, { ok: true, conversationId: convo.$id });
}

/* ================== LIST CONVERSATIONS ================== */

async function listConversations(userId) {
  const memberships = await db.listDocuments(
    DATABASE_ID,
    MEMBERSHIPS_COL,
    [sdk.Query.equal("userId", userId)]
  );

  if (memberships.documents.length === 0) {
    return json(200, { ok: true, conversations: [] });
  }

  const result = [];

  for (const m of memberships.documents) {
    const convo = await db.getDocument(
      DATABASE_ID,
      CONVERSATIONS_COL,
      m.conversationId
    );

    const others = await db.listDocuments(
      DATABASE_ID,
      MEMBERSHIPS_COL,
      [
        sdk.Query.equal("conversationId", m.conversationId),
        sdk.Query.notEqual("userId", userId),
      ]
    );

    if (others.documents.length !== 1) continue;

    const otherUser = await users.get(others.documents[0].userId);

    result.push({
      $id: convo.$id,
      title: otherUser.name || otherUser.email,
      lastMessageText: convo.lastMessageText || "No messages",
      lastMessageAt: convo.lastMessageAt,
    });
  }

  return json(200, { ok: true, conversations: result });
}
