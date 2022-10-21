FROM public.ecr.aws/lambda/nodejs:14

COPY index.js package.json package-lock.json .env /var/task/ 
RUN npm install

CMD ["index.handler"]