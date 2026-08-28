"""Session-0 Glue probe.

Proves only that a 2-worker G.1X job assuming LabRole starts, runs Spark and
exits cleanly. It reads nothing and writes nothing: any real I/O here would
test S3 permissions rather than the Glue execution path the probe is for.
"""

from pyspark.context import SparkContext
from awsglue.context import GlueContext

sc = SparkContext.getOrCreate()
glue_context = GlueContext(sc)

rows = glue_context.spark_session.range(10).count()
print(f"probe ok: spark counted {rows} rows")
