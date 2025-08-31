import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
	return (
		<main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-blue-900 to-purple-900 text-white">
			<div className="container flex flex-col items-center justify-center gap-12 px-4 py-16">
				<h1 className="text-7xl font-extrabold tracking-tight">
					JPRTY!
				</h1>
				<p className="text-2xl text-center max-w-2xl">
					The ultimate online Jeopardy game experience. Play with friends, test your knowledge, and compete for the top spot!
				</p>
				<div className="flex gap-4">
					<Link href="/game">
						<Button size="lg" className="text-xl px-8 py-6">
							Play Now
						</Button>
					</Link>
					<Link href="/leaderboard">
						<Button size="lg" variant="outline" className="text-xl px-8 py-6 text-black">
							Leaderboard
						</Button>
					</Link>
				</div>
			</div>
		</main>
	);
}
