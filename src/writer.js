import { writeFileSync } from "node:fs";

export const handler = async (event, context) => {
  console.log(JSON.stringify(event));

  const logLines = event?.Records?.map((r) =>
    Buffer.from(r.kinesis.data, "base64").toString("ascii"),
  );

  if (logLines?.length) {
    const filename = `actions-${Date.now()}-${context.awsRequestId}.log`;
    // This directory must match the LocalMountPath of the function's
    // configuration
    writeFileSync(`/mnt/count_files/${filename}`, logLines.join("\n"));
  }
};
