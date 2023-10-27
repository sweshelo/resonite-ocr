FROM node:18
WORKDIR /app
COPY . .
EXPOSE 8080

CMD ["npm", "start"]
