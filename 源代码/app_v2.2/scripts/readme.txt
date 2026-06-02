本文件夹作用：
- 存放数据清洗、数据回填、连通性验证、性能检查与专项诊断脚本。

文件分类说明：
1) backfill_*.py / import_*.py / rebuild_*.py
   - 数据回填与数据重建脚本（数据库初始化、清洗后数据导入）。
2) verify_*.py / final_*_acceptance.py / *_check.py
   - 功能验证、接口验证与验收脚本。
3) diagnose_*.py / inspect_*.py / coverage_*.py
   - 问题诊断、索引检查、覆盖率统计脚本。
4) ingest_documents.py
   - 知识库文本入库脚本（RAG文档分块与向量写入）。
5) generate_demo_guides.py
   - 维度覆盖说明文档生成脚本（按数据覆盖度分组输出）。

使用说明：
- 该目录脚本以运维/验证用途为主，执行前请确认数据库与环境变量配置正确。
