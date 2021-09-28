import "dotenv/config";
import Fastify from "fastify";
import FastifyMultipart from "fastify-multipart";
import { Client } from "minio";
import { nanoid } from "nanoid";
import jsonwebtoken from "jsonwebtoken";
import sharp from "sharp";
import stream from "stream";

const fastify = Fastify();

const minioClient = new Client({
  endPoint: process.env.ENDPOINT!,
  accessKey: process.env.ACCESS_KEY!,
  secretKey: process.env.SECRET_KEY!,
});

fastify.register(FastifyMultipart, {
  limits: {
    fileSize: 12 * 10 ** 6,
  },
});

const imageMimetypes = [
  "image/apng",
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
];

fastify.post("/upload/file", async (req, reply) => {
  if (!req.headers.authorization)
    return reply.status(403).send({
      ok: false,
      error: "TokenNotProvided",
    });

  let token: {
    type: string;
    sub: string;
  };

  try {
    token = jsonwebtoken.verify(
      req.headers.authorization,
      process.env.JWT_KEY!
    ) as {
      type: string;
      sub: string;
    };
  } catch {
    return reply.status(403).send({
      ok: false,
      error: "InvalidToken",
    });
  }

  const file = await req.file();

  if (!file)
    return reply.status(400).send({
      ok: false,
      error: "NoFilePassed",
    });

  const id = nanoid();
  await minioClient.putObject("layers", id, file.file, {
    "Content-Type": file.mimetype,
    "x-amz-acl": "public-read",
    "Content-Disposition": `attachment; filename="${file.filename.replace(
      '"',
      '\\"'
    )}"`,
    userid: token.sub,
  });

  reply.send({
    ok: true,
    id,
  });
});

fastify.post("/upload/avatar", async (req, reply) => {
  if (!req.headers.authorization)
    return reply.status(403).send({
      ok: false,
      error: "TokenNotProvided",
    });

  let token: {
    type: string;
    sub: string;
  };

  try {
    token = jsonwebtoken.verify(
      req.headers.authorization,
      process.env.JWT_KEY!
    ) as {
      type: string;
      sub: string;
    };
  } catch {
    return reply.status(403).send({
      ok: false,
      error: "InvalidToken",
    });
  }

  const file = await req.file();

  if (!file)
    return reply.send({
      ok: false,
      error: "NoImagePassed",
    });

  if (!imageMimetypes.includes(file.mimetype))
    return reply.send({
      ok: false,
      error: "InvalidMimetype",
    });

  const id = nanoid();

  const passthrough = new stream.PassThrough();
  const sizeTransform = sharp().resize(500, 500).webp();
  file.file.pipe(sizeTransform).pipe(passthrough);

  await minioClient.putObject("layers", id, passthrough, {
    "Content-Type": file.mimetype,
    "x-amz-acl": "public-read",
    userid: token.sub,
  });

  reply.send({
    ok: true,
    id,
  });
});

fastify.listen(3001, (err) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});
