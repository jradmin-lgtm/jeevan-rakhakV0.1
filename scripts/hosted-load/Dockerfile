FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1
WORKDIR /app/scripts/hosted-load
COPY scripts/hosted-load/package.json scripts/hosted-load/package-lock.json ./
RUN npm ci --ignore-scripts --registry=https://registry.npmjs.org
COPY scripts/hosted-load/*.cjs ./
COPY apps/driver-app/src/locationQueue.ts ./production-location-queue.ts
COPY apps/user-app/src/socket.ts ./production-user-socket.ts
COPY apps/driver-app/src/socket.ts ./production-driver-socket.ts
COPY packages/ui/src/maps/tracking.ts ./production-tracking.ts
COPY apps/user-app/src/screens/LiveTrackingScreen.tsx ./production-live-screen.tsx
ENV NODE_ENV=production
EXPOSE 10000
CMD ["node", "host.cjs"]
