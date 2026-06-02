本文件夹作用：
- 项目根目录，存放服务运行配置、核心源码目录、数据目录与脚本工具。

主要文件说明：
1) .env
   - 本地运行环境变量配置（数据库、鉴权、模型等参数）。
2) requirements.txt
   - Python 依赖清单。
3) Dockerfile / docker-compose.yml
   - 容器化构建与编排配置。
4) alembic.ini
   - 数据库迁移配置入口。
5) test_local.db
   - 本地SQLite数据文件（用于本地回退查询与验证）。
6) start_app.bat
   - 一键启动脚本（Windows），自动加载 `.env` 并启动后端服务（支持指定端口）。

关键文件放置说明（为避免不良影响，保持在根目录）：
- `.env`：启动命令与 docker-compose 默认从根目录读取。
- `docker-compose.yml` / `Dockerfile`：compose 与镜像构建依赖当前相对路径。
- `requirements.txt`：Dockerfile 默认 `COPY requirements.txt`。
- `alembic.ini`：迁移工具默认按根目录配置查找。
- `test_local.db`：当前代码存在按根目录相对路径访问 SQLite 的逻辑。
- `__init__.py`：保持根包标识，避免历史导入路径异常。

一键启动说明：
- 在项目根目录双击 `start_app.bat` 即可启动。
- 或在命令行执行：`start_app.bat [端口]`
- 默认端口：`8002`
- 示例：
  - `start_app.bat`（启动 8002）
  - `start_app.bat 8000`（启动 8000）
- 默认访问地址：`http://127.0.0.1:8002/web/login.html`

主要子目录说明：
- app：主应用代码（推荐作为实际运行入口）。
- api / core / services：兼容或历史分层目录（部分功能已并入 app）。
- data：结构化数据与知识库数据。
- scripts：数据处理与验证脚本。
- web：前端静态页面资源。
- alembic：数据库迁移脚本。
- tests：测试相关目录。
