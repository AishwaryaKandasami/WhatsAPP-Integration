export default function Home() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center p-8 max-w-md">
        <div className="text-6xl mb-4">{String.fromCodePoint(0x1f9f5)}</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Embroidery WhatsApp Bot
        </h1>
        <p className="text-gray-600 mb-6">
          AI-powered order assistant for embroidery business.
          <br />
          Supports English, Tamil, and Tanglish.
        </p>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-center gap-2 text-green-700">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Bot is running
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-8">
          Webhook endpoint: /api/webhooks/whatsapp
        </p>
      </div>
    </div>
  );
}
