# Smallest possible image that answers HTTP 200 on the same port the dashboard
# uses. Session 0 is testing the ECR push, the LabRole pull, and ALB target
# health -- not the application -- so the payload is deliberately trivial.
FROM public.ecr.aws/docker/library/busybox:1.36

RUN mkdir -p /www && echo 'session-zero probe ok' > /www/index.html

EXPOSE 3000
CMD ["httpd", "-f", "-p", "3000", "-h", "/www"]
