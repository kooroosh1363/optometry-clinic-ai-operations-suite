FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY src ./src
COPY db ./db
COPY public ./public
ENV HOST=0.0.0.0
USER node
EXPOSE 4000
CMD ["node", "src/server.js"]
