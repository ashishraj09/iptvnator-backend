const express = require("express");
const app = express();
const parser = require("iptv-playlist-parser");
const epgParser = require("epg-parser");
const axios = require("axios");
const cors = require("cors");
const zlib = require("zlib");
const LevelDBService = require("./levelDBService");
const logger = require('./logger');
const { authenticateAPIKey, authenticateToken } = require('./authMiddleware');
const { generateToken } = require('./auth');

const isDev = process.env.NODE_ENV === "dev";
const originUrl = process.env.CLIENT_URL
  ? process.env.CLIENT_URL
  : isDev
  ? "http://localhost:4200"
  : "http://localhost:4200";

logger.info(`Development mode: ${isDev}`);
logger.info(`Origin URL: ${originUrl}`);

const corsOptions = {
  origin: originUrl,
  optionsSuccessStatus: 200,
};

app.use(express.json());
app.use(cors(corsOptions));

const https = require("https");
const agent = new https.Agent({
  rejectUnauthorized: false,
});

// Check if ENABLE_EXTERNAL_DB is true
const ENABLE_EXTERNAL_DB = process.env.ENABLE_EXTERNAL_DB === "true";
let databaseService = null;
let dbEnabled = false;

if (ENABLE_EXTERNAL_DB) {
  const dbPath = isDev ? "./data/leveldb" : "/app/data";
  const SECRET_KEY = process.env.SECRET_KEY || 'YOUR-SECRET-KEY';
  logger.info("ENABLE_EXTERNAL_DB is true. LevelDB is initialized.");
  logger.info(`Database path: ${dbPath}`);
  logger.info(`Using Secret key: ${SECRET_KEY}`);
  try {
    databaseService = new LevelDBService(dbPath);
    dbEnabled = true;
    logger.info(`LevelDB initialized successfully at ${dbPath}.`);
  } catch (error) {
    logger.debug(`Failed to initialize LevelDB: ${error.message}`,error);
    databaseService = null;
    dbEnabled = false;
  }
} else {
  logger.info("ENABLE_EXTERNAL_DB is false. LevelDB is not initialized.");
}

app.get("/", (req, res) => res.send("Service is healthy"));

// Route to generate a token, protected by API key
app.post('/token', authenticateAPIKey, (req, res) => {
  try {
    logger.info('[Token Generation] Received request to generate token');

    // Generate the token and get its expiration time
    const { token, expiresIn } = generateToken({ scope: 'api_access' });

    logger.info('[Token Generation] Token generated successfully');
    res.status(200).send({ token, expiresIn });
  } catch (error) {
    logger.error(`[Token Generation] Error generating token: ${error.message}`, error);
    res.status(500).send({ error: 'Internal Server Error: Failed to generate token' });
  }
});

// Route to check connection status
app.get("/connectionStatus", cors(corsOptions), async (req, res) => {
  try {
    logger.info("[connectionStatus] Checking connection status...");
    res.status(200).send({
      status: "OK",
      dbEnabled, // Updated from DBEnabled to dbEnabled
    });
  } catch (error) {
    logger.debug(`Error checking connection status: ${error.message}`,error);
    res.status(500).send({ error: "Error checking connection status" });
  }
});

app.get("/parse", cors(corsOptions), async (req, res) => {
  const { url } = req.query;
  if (isDev) logger.info(url);
  if (!url) return res.status(400).send("Missing url");
  const result = await handlePlaylistParse(url);
  if (result.status) {
    return res.status(result.status).send(result.message);
  }
  return res.send(result);
});

app.get("/parse-xml", cors(corsOptions), async (req, res) => {
  const { url } = req.query;
  logger.info(url);
  if (!url) return res.status(400).send("Missing url");
  const result = await fetchEpgDataFromUrl(url);
  if (result.status === 500) {
    return res.status(result.status).send(result.message);
  }
  return res.send(result);
});

app.get("/xtream", cors(corsOptions), async (req, res) => {
  const xtreamApiPath = "/player_api.php";
  axios
    .get(req.query.url + xtreamApiPath, {
      params: req.query ?? {},
    })
    .then((result) => {
      return res.send({
        payload: result.data,
        action: req.query?.action,
      });
    })
    .catch((err) => {
      return res.send({
        message: err.response?.statusText ?? "Error: not found",
        status: err.response?.status ?? 404,
      });
    });
});

// Route to add multiple playlists
app.post("/addManyPlaylists", authenticateToken, cors(corsOptions), async (req, res) => {
  try {
    const playlists = req.body;

    if (!Array.isArray(playlists) || playlists.length === 0) {
      return res.status(400).send({ error: "Invalid input. Expected an array of playlists." });
    }

    // Insert multiple playlists into the database
    await databaseService.insertMany(playlists);

    // Return only the inserted playlists
    logger.info(`[addManyPlaylists] Successfully added ${playlists.length} playlists.`);
    res.status(200).send({
      message: `${playlists.length} playlists added successfully.`,
      data: playlists, // Return the inserted playlists
    });
  } catch (error) {
    logger.error(`[addManyPlaylists] Error adding multiple playlists to LevelDB: ${error.message}`, error);
    res.status(500).send({ error: "Error adding multiple playlists to LevelDB" });
  }
});

// Route to insert a single playlist into LevelDB
app.post("/addPlaylist", authenticateToken, cors(corsOptions), async (req, res) => {
  try {
    const playlist = req.body;
    logger.info(`[addPlaylist] Adding playlist with _id: ${playlist._id}`);
    await databaseService.insertData(playlist._id, playlist); // Use _id as the key
    const insertedPlaylist = await databaseService.readData(playlist._id); // Fetch the inserted playlist
    res.status(200).send(insertedPlaylist); // Return the inserted playlist
  } catch (error) {
    logger.error(`[addPlaylist] Error adding playlist to LevelDB: ${error.message}`,error);
    res.status(500).send({ error: "Error adding playlist to LevelDB" });
  }
});

// Route to get a playlist by ID
app.get("/getPlaylist/:id", authenticateToken, cors(corsOptions), async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`[getPlaylist] Fetching playlist with _id: ${id}`);
    const result = await databaseService.readData(id); // Use _id as the key
    if (!result) {
      return res.status(404).send({ error: `Playlist with ${id} not found` });
    }
    res.status(200).send(result);
  } catch (error) {
    logger.error(`[getPlaylist] Error reading data from LevelDB: ${error.message}`,error);
    res.status(500).send({ error: "Error reading data from LevelDB" });
  }
});

// Route to get all playlists from LevelDB
app.get("/getAllPlaylists", authenticateToken, cors(corsOptions), async (req, res) => {
  try {
    logger.info("[getAllPlaylists] Fetching all playlists");
    const result = await databaseService.readDataAll(); // Fetch all playlists
    res.status(200).send(result);
  } catch (error) {
    logger.error(`[getAllPlaylists] Error reading data from LevelDB: ${error.message}`,error);
    res.status(500).send({ error: "Error reading data from LevelDB" });
  }
});

// Route to delete a playlist by ID from LevelDB
app.delete("/deletePlaylist/:id", authenticateToken, cors(corsOptions), async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`[deletePlaylist] Deleting playlist with _id ${id}`);
    await databaseService.deleteData(id); // Use _id as the key
    res.status(200).send({ message: `Playlist with ${id} deleted successfully` });
  } catch (error) {
    logger.debug(`[deletePlaylist] Error deleting playlist from LevelDB: ${error.message}`,error);
    res.status(500).send({ error: "Error deleting playlist from LevelDB" });
  }
});

// Route to delete all playlists
app.delete("/deleteAllPlaylists", authenticateToken, cors(corsOptions), async (req, res) => {
  try {
    logger.info("[deleteAllPlaylists] Deleting all playlists");
    await databaseService.deleteAllData(); // Use deleteAll from LevelDBService
    res.status(200).send({ message: "All playlists deleted successfully" });
  } catch (error) {
    logger.debug(`[deleteAllPlaylists] Error deleting all playlists from LevelDB: ${error.message}`,error);
    res.status(500).send({ error: "Error deleting all playlists from LevelDB" });
  }
});

// Route to update a playlist by ID in LevelDB
app.put("/updatePlaylist/:id", authenticateToken, cors(corsOptions), async (req, res) => {
  try {
    const { id } = req.params;
    const updatedPlaylist = req.body;

    logger.info(`[updatePlaylist] Updating playlist with _id ${id}`);
    // Check if the playlist exists
    const existingPlaylist = await databaseService.readData(id);
    if (!existingPlaylist) {
      logger.warn(`[updatePlaylist] Checking if playlist with _id ${id} exists in the database.`);
      return res.status(404).send({ error: `Playlist with ID ${id} not found` });
    }

    // Merge the updated data with the existing playlist
    const mergedPlaylist = { ...existingPlaylist, ...updatedPlaylist };

    // Update the playlist in the database
    await databaseService.updateData(id, mergedPlaylist);

    // Fetch the updated playlist
    const updatedData = await databaseService.readData(id);

    res.status(200).send(updatedData);
  } catch (error) {
    logger.error(`Error updating playlist in LevelDB: ${error.message}`,error);
    res.status(500).send({ error: "Error updating playlist in LevelDB" });
  }
});

app.get("/stalker", cors(corsOptions), async (req, res) => {
  axios
    .get(req.query.url, {
      params: req.query ?? {},
      headers: {
        Cookie: `mac=${req.query.macAddress}`,
        ...(req.query.token
          ? {
              Authorization: `Bearer ${req.query.token}`,
            }
          : {}),
      },
    })
    .then((result) => {
      logger.info(result.data);
      return res.send({
        payload: result.data,
        action: req.query?.action,
      });
    })
    .catch((err) => {
      return res.send({
        message: err.response?.statusText ?? "Error: not found",
        status: err.response?.status ?? 404,
      });
    });
});

const epgLoggerLabel = "[EPG Worker]";

/**
 * Fetches the epg data from the given url
 * @param epgUrl url of the epg file
 */
const fetchEpgDataFromUrl = (epgUrl) => {
  try {
    let axiosConfig = {};
    if (epgUrl.endsWith(".gz")) {
      axiosConfig = {
        responseType: "arraybuffer",
      };
    }
    return axios
      .get(epgUrl.trim(), axiosConfig)
      .then((response) => {
        logger.info(epgLoggerLabel, "url content was fetched...");
        const { data } = response;
        if (epgUrl.endsWith(".gz")) {
          logger.info(epgLoggerLabel, "start unzipping...");
          const output = zlib.gunzipSync(new Buffer.from(data)).toString();
          const result = getParsedEpg(output);
          logger.info(result);
          return result;
        } else {
          const result = getParsedEpg(data.toString());
          return result;
        }
      })
      .catch((err) => {
        logger.error(epgLoggerLabel, err);
      });
  } catch (error) {
    logger.error(epgLoggerLabel, error);
  }
};

/**
 * Parses and sets the epg data
 * @param xmlString xml file content from the fetched url as string
 */
const getParsedEpg = (xmlString) => {
  logger.info(epgLoggerLabel, "start parsing...");
  return epgParser.parse(xmlString);
};

const handlePlaylistParse = (url) => {
  try {
    return axios
      .get(url, { httpsAgent: agent })
      .then((result) => {
        const parsedPlaylist = parsePlaylist(result.data.split("\n"));
        const title = getLastUrlSegment(url);
        const playlistObject = createPlaylistObject(title, parsedPlaylist, url);
        return playlistObject;
      })
      .catch((error) => {
        if (error.response) {
          return {
            status: error.response.status,
            message: error.response.statusText,
          };
        } else {
          return { status: 500, message: "Error, something went wrong" };
        }
      });
  } catch (error) {
    return error;
  }
};

/**
 * Returns last segment (part after last slash "/") of the given URL
 * @param value URL as string
 */
const getLastUrlSegment = (value) => {
  if (value && value.length > 1) {
    return value.substr(value.lastIndexOf("/") + 1);
  } else {
    return "Playlist without title";
  }
};

/**
 * Parses string based array to playlist object
 * @param m3uArray m3u playlist as array with strings
 */
const parsePlaylist = (m3uArray) => {
  const playlistAsString = m3uArray.join("\n");
  return parser.parse(playlistAsString); //.channels[0];
};

const guid = () => {
  return Math.random().toString(36).slice(2);
};

const createPlaylistObject = (name, playlist, url) => {
  return {
    id: guid(),
    _id: guid(),
    filename: name,
    title: name,
    count: playlist.items.length,
    playlist: {
      ...playlist,
      items: playlist.items.map((item) => ({
        id: guid(),
        ...item,
      })),
    },
    importDate: new Date().toISOString(),
    lastUsage: new Date().toISOString(),
    favorites: [],
    autoRefresh: false,
    url,
  };
};

const port = process.env.PORT || 3000;
app.listen(port, () =>
  logger.info(`Server running on ${port}, http://localhost:${port}`)
);
