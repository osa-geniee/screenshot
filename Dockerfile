FROM public.ecr.aws/lambda/nodejs:14-x86_64

COPY index.js package.json package-lock.json .env /var/task/ 
RUN npm install

CMD ["index.handler"]