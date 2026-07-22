import Link from "next/link";
import { CreateRoomButton } from "@/components/create-room-button";
import { AppMark, DoorClosed, Ghost, Moon, ScanLine, UsersRound, Zap } from "@/components/icons";

const steps = [
  { icon: ScanLine, number: "01", title: "방을 열고", text: "QR이나 링크를 친구에게 보냅니다." },
  { icon: UsersRound, number: "02", title: "각자 숨기고", text: "휴대폰에서 비밀 방을 고릅니다." },
  { icon: Ghost, number: "03", title: "함께 의심하세요", text: "공개 보드에서 거짓말이 드러납니다." },
];

export default function Home() {
  return (
    <main id="main-content" className="home-page">
      <nav className="home-nav">
        <Link href="/" className="brand-link"><AppMark /> IN MY HOUSE</Link>
        <span className="nav-note"><Moon size={15} /> 오늘 밤 열려 있음</span>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span /> A BOARD GAME FOR THE ROOM</div>
          <h1>친구를 집으로.<br /><em>비밀은 손안으로.</em></h1>
          <p>앱 설치 없이 QR 하나로 시작하는 거실 보드게임. 같은 테이블에 앉아 각자의 비밀 화면과 모두의 공개 보드를 오가세요.</p>
          <a className="secondary-link" href="#games">오늘 밤의 게임 보기 <span aria-hidden="true">↓</span></a>
        </div>
        <div className="hero-art" aria-label="어두운 집의 네 개 문 중 하나에 유령이 숨어 있는 그림">
          <span className="art-moon" />
          <div className="art-house">
            <span className="roof-line" />
            <div className="art-windows"><i /><i className="lit" /><i /></div>
            <div className="art-door"><Ghost size={34} /></div>
          </div>
          <span className="flashlight-beam" />
          <span className="art-caption">ONE OF THEM IS LYING</span>
        </div>
      </section>

      <section className="how-it-works" aria-labelledby="how-heading">
        <div className="section-heading">
          <span className="eyebrow"><span /> HOW IT WORKS</span>
          <h2 id="how-heading">TV가 없어도, 모두가 같은 판을 봅니다</h2>
        </div>
        <div className="steps-grid">
          {steps.map(({ icon: Icon, number, title, text }) => (
            <article key={number}>
              <span className="step-number">{number}</span>
              <Icon size={24} aria-hidden="true" />
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="games" className="games-section" aria-labelledby="games-heading">
        <div className="section-heading horizontal">
          <div><span className="eyebrow"><span /> TONIGHT’S GAME</span><h2 id="games-heading">어떤 밤을 시작할까요?</h2></div>
          <span className="game-count">01 GAME</span>
        </div>
        <article className="game-card">
          <div className="game-poster">
            <div className="poster-top"><span>3–6 PLAYERS</span><span>10–20 MIN</span></div>
            <DoorClosed size={76} strokeWidth={1.3} aria-hidden="true" />
            <Ghost className="poster-ghost" size={30} aria-hidden="true" />
            <div className="poster-title"><span>THE</span><strong>DARK<br />HOUSE</strong></div>
          </div>
          <div className="game-info">
            <span className="live-badge"><i /> PLAYABLE NOW</span>
            <h3>불 꺼진 집</h3>
            <p>빈 방 사이에 유령을 숨기고, 자신 있게 숫자를 부르세요. 마지막 문을 열기 전까지 누구의 말을 믿을지는 당신의 선택입니다.</p>
            <ul>
              <li><Ghost size={17} /> 블러핑과 눈치 싸움</li>
              <li><Zap size={17} /> 게임당 한 번의 손전등</li>
              <li><UsersRound size={17} /> 한 기기당 한 명</li>
            </ul>
            <CreateRoomButton />
          </div>
        </article>
      </section>

      <footer className="home-footer">
        <AppMark />
        <p>같은 집, 다른 비밀.<br />오늘 밤은 누가 유령을 숨겼을까요?</p>
      </footer>
    </main>
  );
}
