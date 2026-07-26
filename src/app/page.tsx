import Link from "next/link";
import { Footprints, Gem, Shield } from "lucide-react";
import { games } from "@/modules/game-catalog/games";
import { CreateRoomButton } from "@/modules/room/ui/create-room-button";
import { AppMark, CircleHelp, DoorClosed, Ghost, MessageSquareText, Moon, ScanLine, UsersRound, Vote, Zap } from "@/shared/ui/icons";

const steps = [
  { icon: ScanLine, number: "01", title: "방을 열고", text: "QR이나 링크를 친구에게 보냅니다." },
  { icon: UsersRound, number: "02", title: "각자 확인하고", text: "휴대폰에서 나만의 역할과 정보를 봅니다." },
  { icon: Ghost, number: "03", title: "같이 해결하세요", text: "공개 보드에서 선택과 결과를 함께 확인합니다." },
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
          <span className="art-caption">ONE ROOM · MANY SECRETS</span>
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
          <div><span className="eyebrow"><span /> TONIGHT’S GAMES</span><h2 id="games-heading">어떤 밤을 시작할까요?</h2></div>
          <span className="game-count">{String(games.length).padStart(2, "0")} GAMES</span>
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
            <CreateRoomButton gameId="dark-house" label="불을 끄고 시작하기" />
          </div>
        </article>
        <article className="game-card">
          <div className="game-poster invitation-poster">
            <div className="poster-top"><span>3–6 PLAYERS</span><span>15–25 MIN</span></div>
            <CircleHelp size={76} strokeWidth={1.3} aria-hidden="true" />
            <div className="invitation-lines" aria-hidden="true"><i /><i /><i /></div>
            <div className="poster-title"><span>THE</span><strong>ODD<br />INVITE</strong></div>
          </div>
          <div className="game-info">
            <span className="live-badge"><i /> PLAYABLE NOW</span>
            <h3>수상한 초대장</h3>
            <p>같은 단어를 받은 사람들 사이에, 단어를 모르는 Stranger가 숨어 있습니다. 티 나지 않는 단서를 남기고 가장 수상한 초대 손님을 찾아내세요.</p>
            <ul>
              <li><MessageSquareText size={17} /> 짧은 단서와 대화</li>
              <li><Vote size={17} /> 비밀 지목과 종료 투표</li>
              <li><UsersRound size={17} /> 원하는 만큼 이어서 플레이</li>
            </ul>
            <CreateRoomButton gameId="suspicious-invite" label="초대장 보내기" />
          </div>
        </article>
        <article className="game-card">
          <div className="game-poster switchboard-poster">
            <div className="poster-top"><span>3–6 PLAYERS</span><span>12–18 MIN</span></div>
            <div className="poster-circuit" aria-hidden="true">
              <i /><i /><i /><i />
              <Zap size={66} strokeWidth={1.35} />
            </div>
            <div className="poster-title"><span>THE</span><strong>DAWN<br />GRID</strong></div>
          </div>
          <div className="game-info">
            <span className="live-badge"><i /> PLAYABLE NOW</span>
            <h3>새벽의 배전반</h3>
            <p>집 전체의 전력이 꺼지기 전, 각자에게 흩어진 회로 단서를 말로 조합하세요. 차례대로 스위치를 확정해 세 개의 배전반을 함께 복구합니다.</p>
            <ul>
              <li><MessageSquareText size={17} /> 서로 다른 비밀 단서</li>
              <li><Zap size={17} /> 12분과 퓨즈 3개</li>
              <li><UsersRound size={17} /> 순번 릴레이 공동 승리</li>
            </ul>
            <CreateRoomButton gameId="dawn-switchboard" label="배전반 복구 시작하기" />
          </div>
        </article>
        <article className="game-card">
          <div className="game-poster footprints-poster">
            <div className="poster-top"><span>2 PLAYERS</span><span>15–25 MIN</span></div>
            <div className="poster-footprints" aria-hidden="true">
              <Footprints size={72} strokeWidth={1.3} />
              <Shield size={40} strokeWidth={1.35} />
            </div>
            <div className="poster-title"><span>THE</span><strong>MIDNIGHT<br />FOOTPRINTS</strong></div>
          </div>
          <div className="game-info">
            <span className="live-badge"><i /> PLAYABLE NOW</span>
            <h3>한밤의 발자국</h3>
            <p>괴도는 아홉 방을 비밀리에 누비고, 경비는 번갈아 드러나는 구역과 바닥 흔적을 쫓습니다. 역할을 바꿔 두 번 잠입한 뒤 더 좋은 성과를 겨루세요.</p>
            <ul>
              <li><Footprints size={17} /> 숨겨진 이동과 공개 흔적</li>
              <li><Shield size={17} /> 이동·수색과 통로 봉쇄</li>
              <li><Gem size={17} /> 위험할수록 값비싼 목표물</li>
            </ul>
            <CreateRoomButton gameId="midnight-footprints" label="야간 잠입 시작하기" />
          </div>
        </article>
      </section>

      <footer className="home-footer">
        <AppMark />
        <p>같은 집, 다른 비밀.<br />의심하거나, 협력하거나, 함께 즐기세요.</p>
      </footer>
    </main>
  );
}
