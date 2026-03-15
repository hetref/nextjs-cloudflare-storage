import { Uploader } from "@/components/web/Uploader";
import { MediaBrowser } from "@/components/web/MediaBrowser";

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto flex min-h-screen flex-col py-10 px-4">
      <h1 className="text-4xl font-bold pb-10">Upload your Files with S3 📂</h1>
      <Uploader />
      <MediaBrowser />
    </div>
  );
}
