@echo off

echo 正在从 GitHub 网页端拉取最新修改，防止覆盖...
git pull origin main --rebase

echo Adding files...
git add .

echo Committing...
git commit -m "auto update"

echo Pushing...
git push

echo Done!
pause