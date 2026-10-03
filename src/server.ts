import app from "./app";
import config from "./config";

const PORT = config.port;

app.listen(PORT, () => {
  console.log(
    `🛡️  Courier Fraud Check by WebCraft running at http://localhost:${PORT}`,
  );
});
