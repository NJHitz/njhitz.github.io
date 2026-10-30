FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --chown=node:node package.json server.mjs ./
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
